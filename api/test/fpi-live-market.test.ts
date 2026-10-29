import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { migrate, SqliteDatabase } from "../src/db/sqlite.js";
import type { Env } from "../src/env.js";
import { liveMarket } from "../src/live/market.js";

const db = new SqliteDatabase(":memory:");
const env: Env = { DB: db, PUBLIC_SITE_ORIGIN: "https://arthscan.me", TOKEN_PEPPER: "p", INTERNAL_API_KEY: "i", FREE_DAILY_QUOTA: "50" };
const call = async (path: string) => {
  const res = await app.fetch(new Request(`https://x${path}`, { headers: { "x-internal-key": "i" } }), env);
  return { status: res.status, body: (await res.json()) as any };
};

beforeAll(() => {
  migrate(db);
  db.raw.exec(`
    INSERT INTO stocks (symbol, name, sector) VALUES ('AAA', 'Aaa Ltd', 'Banks'), ('BBB', 'Bbb Ltd', 'Banks'), ('CCC', 'Ccc Ltd', 'IT'), ('ETF1', 'Some ETF', NULL);
    UPDATE stocks SET instrument_type = 'ETF' WHERE symbol = 'ETF1';
    INSERT INTO stock_metrics (symbol, as_of, close, avg_volume_20d, high_52w, low_52w) VALUES
      ('AAA', '2026-10-28', 100, 100000, 105, 50), ('BBB', '2026-10-28', 200, 50000, 300, 190),
      ('CCC', '2026-10-28', 50, 1000000, 80, 40), ('ETF1', '2026-10-28', 10, 1, 11, 9);
    INSERT INTO fpi_daily VALUES ('2026-10-27', 100, 150, -50), ('2026-10-28', 300, 200, 100);
    INSERT INTO fpi_sector VALUES
      ('2026-09-30', 'Power', -10, 1000), ('2026-10-15', 'Power', 20, 1100),
      ('2026-09-30', 'Healthcare', 5, 3000), ('2026-10-15', 'Healthcare', -7, 2900),
      ('2026-10-15', 'Grand Total', 13, 4000), ('2026-10-15', 'Sovereign', 0, 0);
  `);
});

describe("FPI flows", () => {
  it("returns daily flows oldest first and sector flows aligned to fortnights", async () => {
    const r = await call("/v1/market/fpi");
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(d.daily.map((x: any) => x.net)).toEqual([-50, 100]);
    expect(d.fortnights).toEqual(["2026-09-30", "2026-10-15"]);
    expect(d.sectors.map((s: any) => s.sector)).toEqual(["Healthcare", "Power"]); // by holdings
    expect(d.sectors[1]).toEqual({ sector: "Power", auc: 1100, flows: [-10, 20] });
    expect(d.total.flows).toEqual([null, 13]);
  });

  it("filters to one sector and 404s on an unknown one", async () => {
    expect((await call("/v1/market/fpi?sector=Power")).body.data.sectors).toHaveLength(1);
    expect((await call("/v1/market/fpi?sector=Nope")).status).toBe(404);
  });
});

describe("live market views", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("ranks live movers, finds intraday signals and leaves out ETFs and illiquid stocks", async () => {
    // Inside the session (Thu 29 Oct 2026, 11:00 IST), no holiday.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-29T05:30:00Z"));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ CM: [] }))));
    const status = { state: "live", message: "", lastTickAt: 1 };
    const m = (await liveMarket(env, async () => ({
      status,
      rows: [
        ["AAA", 110, 10, 400000, 110], // ₹4.4 Cr turnover, 4x volume, above 52W high
        ["BBB", 180, -10, 100000, 185], // ₹1.85 Cr, below 52W low
        ["CCC", 51, 2, 10000, 51], // ₹5 L: too thin for movers
        ["ETF1", 12, 20, 10_000_000, 12], // not an ordinary share
        ["ZZZ", 5, 1, 1, 5], // no reference row
      ],
    }))) as any;
    expect(m.stocks).toBe(3);
    expect(m.breadth).toMatchObject({ advances: 2, declines: 1, at_52w_high: 1, at_52w_low: 1 });
    expect(m.movers.gainers.map((s: any) => s.symbol)).toEqual(["AAA", "BBB"]);
    expect(m.movers.losers[0].symbol).toBe("BBB");
    expect(m.signals.volume_spike.map((s: any) => s.symbol)).toEqual(["AAA"]);
    expect(m.signals.breakout_high.map((s: any) => s.symbol)).toEqual(["AAA"]);
    expect(m.signals.breakout_low.map((s: any) => s.symbol)).toEqual(["BBB"]);
    expect(m.sectors.find((s: any) => s.sector === "Banks").median_change).toBe(10);
  });
});

describe("live views outside the session", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it("report the market closed after hours, so pages show NSE's closing figures", async () => {
    const { liveMarket: lm } = await import("../src/live/market.js");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-29T15:30:00Z")); // 21:00 IST
    const snapshot = vi.fn(async () => ({ status: { state: "live", message: "", lastTickAt: 1 }, rows: [["AAA", 110, 0, 1, 1]] as any }));
    await new Promise((r) => setTimeout(r, 0));
    const m = (await lm(env, snapshot)) as any;
    expect(m.session).toBe("closed");
    expect(m.stocks).toBe(0);
    expect(snapshot).not.toHaveBeenCalled();
  });
});
