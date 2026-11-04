import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrate, SqliteDatabase } from "../src/db/sqlite.js";
import type { Env } from "../src/env.js";
import { fillBseHistory, quoteRow, refreshBse } from "../src/jobs/bse.js";
import { fillStatements } from "../src/lib/statements.js";

const db = new SqliteDatabase(":memory:");
const env = { DB: db, DHAN_CLIENT_ID: "c", DHAN_ACCESS_TOKEN: "t", INDIANAPI_KEY: "k" } as unknown as Env;
const T1 = Date.UTC(2026, 9, 30, 18, 30) / 1000; // 31 Oct 00:00 IST
const quote = (over = {}) => ({ last_price: 12, last_trade_time: "03/11/2026 15:29:58", volume: 100, average_price: 11.5, ohlc: { open: 10, high: 13, low: 9, close: 10.5 }, ...over });

beforeEach(() => {
  migrate(db);
  db.raw.exec(`DELETE FROM bse_daily_prices; DELETE FROM bse_stocks; DELETE FROM company_statements; DELETE FROM external_cache;
    INSERT INTO bse_stocks (symbol, name, isin, dhan_security_id, bse_group, median_turnover) VALUES
      ('SMALL', 'Small Ltd', 'INE000000101', '101', 'X', 100), ('BIG', 'Big Ltd', 'INE000000201', '201', 'B', 9000);`);
});
afterEach(() => vi.unstubAllGlobals());

const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const sentBody = (f: { mock: { calls: unknown[][] } }) => JSON.parse((f.mock.calls[0]![1] as RequestInit).body as string);

describe("BSE quotes", () => {
  it("uses last_price as the close and ohlc.close as the previous close", () => {
    expect(quoteRow("A", quote())).toEqual(["A", "2026-11-03", 10, 13, 9, 12, 10.5, 100, 1150]);
  });
  it("skips a stock with no trade, which Dhan stamps at midnight", () => {
    expect(quoteRow("A", quote({ last_trade_time: "03/11/2026 00:00:00" }))).toBeNull();
    expect(quoteRow("A", quote({ last_price: 0 }))).toBeNull();
  });
  it("stores only stocks that traded, and repeats safely", async () => {
    const f = vi.fn(async (_url: string, _init: RequestInit) => answer({ data: { BSE_EQ: { 101: quote(), 201: quote({ last_trade_time: "03/11/2026 00:00:00" }) } } }));
    vi.stubGlobal("fetch", f);
    expect(await refreshBse(env)).toEqual({ stocks: 2, saved: 1, corrected: 0, failedCalls: 0 });
    await refreshBse(env);
    expect(db.raw.prepare("SELECT symbol, date, close, prev_close FROM bse_daily_prices").all()).toEqual([{ symbol: "SMALL", date: "2026-11-03", close: 12, prev_close: 10.5 }]);
    expect(sentBody(f)).toEqual({ BSE_EQ: [101, 201] });
  });
  it("reports a failed call instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, _init: RequestInit) => answer({ errorCode: "DH-901" }, 401)));
    expect(await refreshBse(env)).toEqual({ stocks: 2, saved: 0, corrected: 0, failedCalls: 1 });
  });
});

describe("BSE closes", () => {
  const closes = (symbol: string) => db.raw.prepare("SELECT date, close FROM bse_daily_prices WHERE symbol = ? ORDER BY date").all(symbol);
  const addRow = (symbol: string, date: string, close: number) =>
    db.raw.prepare("INSERT INTO bse_daily_prices (symbol, date, close) VALUES (?, ?, ?)").run(symbol, date, close);
  const refreshWith = (quotes: Record<string, unknown>) => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, _init: RequestInit) => answer({ data: { BSE_EQ: quotes } })));
    return refreshBse(env);
  };

  it("replaces the last trade with the official close from the next session's quote", async () => {
    addRow("SMALL", "2026-11-02", 275.1);
    const r = await refreshWith({ 101: quote({ ohlc: { open: 10, high: 13, low: 9, close: 277.2 } }) });
    expect(r.corrected).toBe(1);
    expect(closes("SMALL")).toEqual([{ date: "2026-11-02", close: 277.2 }, { date: "2026-11-03", close: 12 }]);
  });
  it("corrects from a stock with no trade yet, leaving today without a row", async () => {
    addRow("SMALL", "2026-11-02", 275.1);
    await refreshWith({ 101: quote({ last_trade_time: "03/11/2026 00:00:00", ohlc: { open: 0, high: 0, low: 0, close: 277.2 } }) });
    expect(closes("SMALL")).toEqual([{ date: "2026-11-02", close: 277.2 }]);
  });
  it("corrects only the latest session before the quote, even after a gap, and repeats safely", async () => {
    addRow("SMALL", "2026-10-20", 100);
    addRow("SMALL", "2026-10-29", 275.1);
    const q = { 101: quote({ ohlc: { open: 10, high: 13, low: 9, close: 277.2 } }) };
    await refreshWith(q);
    expect((await refreshWith(q)).corrected).toBe(0);
    expect(closes("SMALL").slice(0, 2)).toEqual([{ date: "2026-10-20", close: 100 }, { date: "2026-10-29", close: 277.2 }]);
  });
  it("leaves a bigger gap alone, because that is a split or bonus and not a correction", async () => {
    addRow("SMALL", "2026-11-02", 300);
    expect((await refreshWith({ 101: quote({ ohlc: { open: 10, high: 13, low: 9, close: 150 } }) })).corrected).toBe(0);
    expect(closes("SMALL")[0]).toEqual({ date: "2026-11-02", close: 300 });
  });
  it("doesn't touch another stock", async () => {
    addRow("BIG", "2026-11-02", 275.1);
    await refreshWith({ 101: quote({ ohlc: { open: 10, high: 13, low: 9, close: 277.2 } }) });
    expect(closes("BIG")).toEqual([{ date: "2026-11-02", close: 275.1 }]);
  });
});

describe("BSE history", () => {
  const candles = { timestamp: [T1, T1 + 86400], open: [1, 2], high: [2, 3], low: [1, 2], close: [2, 3], volume: [10, 20] };

  it("loads the busiest first on the BSE segment, then leaves loaded stocks alone", async () => {
    const f = vi.fn(async (_url: string, _init: RequestInit) => answer(candles));
    vi.stubGlobal("fetch", f);
    expect(await fillBseHistory(env, { batch: 1, gapMs: 0 })).toEqual({ asked: 1, loaded: 1, failed: 0 });
    expect(sentBody(f)).toMatchObject({ securityId: "201", exchangeSegment: "BSE_EQ" });
    expect(db.raw.prepare("SELECT date, close, prev_close, turnover FROM bse_daily_prices ORDER BY date").all()).toEqual([
      { date: "2026-10-31", close: 2, prev_close: null, turnover: 20 }, { date: "2026-11-01", close: 3, prev_close: 2, turnover: 60 }]);
    await fillBseHistory(env, { gapMs: 0 });
    expect((await fillBseHistory(env, { gapMs: 0 })).asked).toBe(0);
  });
  it("waits a day after a failure, and stops the batch if Dhan keeps failing", async () => {
    db.raw.exec(`INSERT INTO bse_stocks (symbol, name, isin, dhan_security_id, median_turnover)
      SELECT 'S' || value, 'n', 'I' || value, 'D' || value, 1 FROM json_each('[1,2,3,4,5,6,7,8]');`);
    const f = vi.fn(async (_url: string, _init: RequestInit) => answer({ errorCode: "DH-907" }, 400));
    vi.stubGlobal("fetch", f);
    expect(await fillBseHistory(env, { gapMs: 0 })).toEqual({ asked: 5, loaded: 0, failed: 5 });
    expect(await fillBseHistory(env, { gapMs: 0 })).toMatchObject({ failed: 5 });
    expect(f.mock.calls.length).toBe(10);
  });
});

describe("BSE-only stocks stay apart", () => {
  it("fills statements after the NSE queue, under a BSE- key, asking by BSE symbol", async () => {
    const f = vi.fn(async (_url: string, _init: RequestInit) => answer({ quarter_results: { Sales: { "Sep 2026": 1 } } }));
    vi.stubGlobal("fetch", f);
    const r = await fillStatements(env, { maxRequests: 1, dailyCap: 100 });
    expect(r.asked).toBe(1);
    expect(new URL(f.mock.calls[0]![0] as string).searchParams.get("stock_name")).toBe("BIG");
    expect(db.raw.prepare("SELECT symbol FROM company_statements").all()).toEqual([{ symbol: "BSE-BIG" }]);
  });
  it("adds nothing to the NSE tables", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, _init: RequestInit) => answer({ data: { BSE_EQ: { 101: quote() } } })));
    const before = db.raw.prepare("SELECT (SELECT COUNT(*) FROM stocks) s, (SELECT COUNT(*) FROM daily_prices) d, (SELECT COUNT(*) FROM stock_metrics) m").get();
    await refreshBse(env);
    expect(db.raw.prepare("SELECT (SELECT COUNT(*) FROM stocks) s, (SELECT COUNT(*) FROM daily_prices) d, (SELECT COUNT(*) FROM stock_metrics) m").get()).toEqual(before);
  });
});
