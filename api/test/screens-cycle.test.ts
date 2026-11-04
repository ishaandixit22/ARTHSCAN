// The whole path a stored or live result takes, on an in-memory database and a stand-in for Dhan.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteDatabase, migrate } from "../src/db/sqlite.js";
import { SCREENS } from "../src/screens/catalogue.js";
import { buildFundPack, refreshMinuteHistory, runIntradayCycle, runLive, runWeekly, storedAnswer } from "../src/screens/run.js";
import { buildSeries, loadSeries } from "../src/screens/series.js";

const SYMBOLS = ["AAA", "BBB", "CCC"];
const dir = mkdtempSync(join(tmpdir(), "screens-"));
const db = new SqliteDatabase(join(dir, "t.db"));
migrate(db);
const env: any = { DB: db, DHAN_ACCESS_TOKEN: "t", DHAN_CLIENT_ID: "c" };

const day = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 86400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  for (const [i, s] of SYMBOLS.entries()) {
    await db.prepare("INSERT INTO stocks (symbol, name, face_value, dhan_security_id, instrument_type) VALUES (?, ?, 10, ?, 'ES')").bind(s, `${s} Ltd`, String(100 + i)).run();
    await db.prepare("INSERT INTO stock_metrics (symbol, as_of, close, turnover) VALUES (?, ?, 100, 1000)").bind(s, day(299)).run();
    for (let d = 0; d < 300; d++) {
      const c = 100 + d * (i === 0 ? 1 : i === 1 ? 0 : -0.1);
      await db.prepare("INSERT INTO daily_prices (symbol, date, open, high, low, close, volume, turnover, adj) VALUES (?, ?, ?, ?, ?, ?, 1000, 100000, 1)").bind(s, day(d), c, c + 1, c - 1, c).run();
    }
    await db.prepare("INSERT INTO index_members VALUES ('nifty500', ?)").bind(s).run();
  }
  const y = (a: number[]) => Object.fromEntries(a.map((v, i) => [`Mar ${2026 - i}`, v]));
  await db.prepare("INSERT INTO company_statements (symbol, body, fetched_at, found) VALUES ('AAA', ?, 1, 1)").bind(JSON.stringify({
    yoy_results: { Sales: y([100, 90]), "Net Profit": y([10, 9]) }, quarter_results: { "Net Profit": { "Sep 2026": 3 } }, shareholding_pattern_quarterly: { Promoters: { "Sep 2026": 80 } },
  })).run();
});
afterAll(() => { vi.unstubAllGlobals(); vi.useRealTimers(); rmSync(dir, { recursive: true, force: true }); });

describe("screen runs", () => {
  it("builds the candle store, then a weekly screen stores only stocks with company data", async () => {
    const built = await buildSeries(env);
    expect(built.stocks).toBe(3);
    expect((await loadSeries(env))!.index.stocks[0][4]).toBe(300);
    await buildFundPack(env);
    const r = await runWeekly(env);
    expect(r.as_of).toBe(day(299));
    const a = await storedAnswer(env, SCREENS.find((s) => s.id === "S084")!); // promoter holding above 74%
    expect(a!.rows.map((x) => x.symbol)).toEqual(["AAA"]);
    expect(a!.checked).toBe(1);
    expect(a!.freshness.mode).toBe("weekly");
    expect(a!.freshness.as_of).toBe(day(299));
  });

  it("marks a screen no stock holds the figures for, rather than reporting nothing passed", async () => {
    const r = await runWeekly(env);
    expect(r.screens).toBeGreaterThan(0);
    const a = await storedAnswer(env, SCREENS.find((s) => s.id === "S091")!); // cash above market cap: no cash figure held
    expect(a!.rows).toEqual([]);
    expect(a!.checked).toBe(0);
  });

  it("runs a daily-chart screen on the last close when the market is shut", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); })); // live prices unavailable, whatever the hour
    const a = await runLive(env, SCREENS.find((x) => x.id === "S113")!); // five higher closes
    expect(a.freshness.mode).toBe("close");
    expect(a.freshness.as_of).toBe(day(299));
    expect(a.checked).toBe(3);
    expect(a.rows.map((x) => x.symbol)).toEqual(["AAA"]);
  });

  it("uses live prices in market hours, and a trade today changes the answer", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2030-11-04T05:30:00Z") }); // Monday, 11:00 in India
    const url: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      url.push(String(u));
      if (!String(u).includes("/marketfeed/quote")) throw new Error("not the quote call"); // the holiday list stays unread, so the day counts as open
      return new Response(JSON.stringify({ data: { NSE_EQ: {
        100: { last_price: 300, last_trade_time: "04/11/2030 10:59:58", volume: 5000, ohlc: { open: 310, high: 312, low: 299 } }, // AAA drops, ending its run of higher closes
        101: { last_price: 100, last_trade_time: "01/11/2030 15:29:00", volume: 10, ohlc: { open: 100, high: 100, low: 100 } }, // BBB hasn't traded today
      } } }), { status: 200 });
    }));
    const a = await runLive(env, SCREENS.find((x) => x.id === "S113")!);
    expect(url.some((u) => u.includes("/marketfeed/quote"))).toBe(true);
    expect(a.freshness.mode).toBe("live");
    expect(a.freshness.live_stocks).toBe(1);
    expect(a.rows).toEqual([]);
    vi.useRealTimers();
  });

  it("loads minute history and runs an intraday pass on finished candles only", async () => {
    const now = Math.floor(Date.now() / 1000);
    const step = 300;
    const newest = now - (now % step); // the candle still forming
    const stamps = Array.from({ length: 40 }, (_, i) => newest - (39 - i) * step);
    const bodies: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
      const body = JSON.parse(init.body);
      bodies.push({ url: String(url), body });
      return new Response(JSON.stringify({
        timestamp: stamps, open: stamps.map(() => 100), high: stamps.map(() => 101), low: stamps.map(() => 99), close: stamps.map((_, i) => 100 + i / 10), volume: stamps.map(() => 500),
      }), { status: 200 });
    }));
    const hist = await refreshMinuteHistory(env);
    expect(hist.failed).toBe(0);
    expect(hist.stocks).toBe(3);
    const r: any = await runIntradayCycle(env, { force: true });
    expect(r.ran).toBe(true);
    expect(bodies.every((b) => b.url.includes("/charts/intraday"))).toBe(true);
    // The last counted candle ends at the start of the one still forming.
    expect(r.as_of).toBe(new Date(newest * 1000).toISOString());
    const a = await storedAnswer(env, SCREENS.filter((s) => s.kind === "intraday").find((s) => s.universe !== "fno")!);
    expect(a!.freshness.mode).toBe("intraday");

    // Outside market hours: answers from stored history, without asking Dhan.
    const asked = bodies.length;
    const closed: any = await runIntradayCycle(env, { closed: true });
    expect(closed.ran).toBe(true);
    expect(bodies.length).toBe(asked);
    expect(closed.as_of).toBe(new Date((stamps.at(-1)! + 300) * 1000).toISOString());
  }, 30000);
});
