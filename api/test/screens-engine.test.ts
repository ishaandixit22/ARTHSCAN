import { describe, expect, it, vi } from "vitest";
import { rollMinutes, rsi, sma, type Candles } from "../src/screens/calc.js";
import { compileScreen, SCREENS } from "../src/screens/catalogue.js";
import { hasFigures, StockContext } from "../src/screens/engine.js";
import { computeFundamentals } from "../src/screens/fundamentals.js";
import { parseIndicator, parsePlain } from "../src/screens/rules.js";
import { base64ToFloats, BinaryWriter, floatsToBase64, PART_BYTES, readBinary } from "../src/screens/store.js";

const series = (closes: number[], volume = 1000): Candles => ({
  t: closes.map((_, i) => 20000 + i),
  o: Float64Array.from(closes), h: Float64Array.from(closes.map((c) => c + 1)), l: Float64Array.from(closes.map((c) => c - 1)), c: Float64Array.from(closes), v: Float64Array.from(closes.map(() => volume)),
});
const ctx = (closes: number[], extra = {}) => new StockContext({ symbol: "X", daily: series(closes), ...extra });

describe("reading rules", () => {
  it("doesn't swallow and/or into a field name", () => {
    expect(parseIndicator("latest close > 1 and latest open < 2").k).toBe("and");
    expect(parsePlain("Promoter holding > 74 AND Current price < 5").k).toBe("and");
  });
  it("reads negative numbers and percent signs", () => {
    const n = parseIndicator("latest cci( 20 ) > -50") as any;
    expect(n.b.v).toBe(-50);
    expect((parsePlain("Promoter holding > 4 %") as any).b.v).toBe(4);
  });
  it("refuses a field it doesn't know instead of guessing", () => {
    expect(() => parsePlain("Promoter pledge < 5")).toThrow(/Unknown field/);
    expect(() => parseIndicator("latest magic( 5 ) > 1")).toThrow(/Unknown indicator/);
  });
});

describe("evaluating", () => {
  it("never passes a stock on a figure it lacks", () => {
    expect(ctx([1, 2, 3]).test(parseIndicator("latest sma( close,200 ) < latest close"))).toBe(false);
    expect(ctx([1, 2, 3]).test(parsePlain("Promoter holding > 1"))).toBe(false);
    expect(ctx([1, 2, 3], { fund: { promoter: null } }).test(parsePlain("Promoter holding < 100"))).toBe(false);
  });
  it("needs full history for the all-time high", () => {
    const rule = parsePlain("Current price * 2 > High price all time");
    expect(ctx([10, 11, 12]).test(rule)).toBe(false);
    expect(ctx([10, 11, 12], { ath: 15, atl: 1 }).test(rule)).toBe(true);
    expect(ctx([10, 11, 12], { ath: 100, atl: 1 }).test(rule)).toBe(false);
  });
  it("detects a crossover on the right day", () => {
    const rule = parseIndicator("latest close > latest sma( close,3 ) and 1 day ago close <= 1 day ago sma( close,3 )");
    expect(ctx([10, 10, 10, 10, 12]).test(rule)).toBe(true);
    expect(ctx([10, 10, 10, 12, 13]).test(rule)).toBe(false);
  });
  it("works out price-based company figures at the run's price", () => {
    const rule = parsePlain("Price to Earning < 10");
    const fund = { shares: 10, np: 100 };
    expect(ctx([50, 90], { fund }).test(rule)).toBe(true); // 900 / 100 = 9
    expect(ctx([50, 110], { fund }).test(rule)).toBe(false); // 1100 / 100 = 11
  });
  it("tells a failed test from one that couldn't be run", () => {
    const rule = parsePlain("Promoter holding > 90");
    expect(hasFigures(ctx([1, 2], { fund: { promoter: 50 } }), rule)).toBe(true);
    expect(hasFigures(ctx([1, 2], { fund: { promoter: null } }), rule)).toBe(false);
    expect(hasFigures(ctx([1, 2]), parseIndicator("latest sma( close,200 ) > 1"))).toBe(false);
  });
  it("calculates a known RSI", () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(rsi(Float64Array.from(up), 14).at(-1)).toBe(100);
    expect(sma(Float64Array.from([1, 2, 3, 4]), 2).at(-1)).toBe(3.5);
  });
});

describe("intraday candles", () => {
  const session = 1793000000 - (1793000000 % 86400) + 13500 - 19800 + 19800; // any day; 03:45 UTC is 09:15 IST
  const fiveMin = (n: number): Candles => {
    const t = Array.from({ length: n }, (_, i) => session + i * 300);
    return { t, o: Float64Array.from(t.map((_, i) => 100 + i)), h: Float64Array.from(t.map((_, i) => 101 + i)), l: Float64Array.from(t.map((_, i) => 99 + i)), c: Float64Array.from(t.map((_, i) => 100.5 + i)), v: Float64Array.from(t.map(() => 10)) };
  };
  it("rolls 5-minute candles from the 9:15 open", () => {
    const m = rollMinutes(fiveMin(6), 15);
    expect(m.c.length).toBe(2);
    expect(m.o[0]).toBe(100);
    expect(m.c[0]).toBe(102.5);
    expect(m.h[0]).toBe(103);
    expect(m.v[1]).toBe(30);
  });
  it("counts a bigger candle only once it has finished", () => {
    const rule = parseIndicator("[0] 15 minute close > 0") as any;
    const data = { symbol: "X", daily: series([1]), minutes: fiveMin(4) };
    // Four 5-minute candles: the second 15-minute candle has one of three, so [0] is still the first.
    const c = new StockContext({ ...data, cutoff: session + 20 * 60 });
    expect(c.value(rule.a)).toBe(102.5);
    const done = new StockContext({ ...data, minutes: fiveMin(6), cutoff: session + 30 * 60 });
    expect(done.value(rule.a)).toBe(105.5);
  });
});

describe("company figures", () => {
  const q = (vals: number[]) => Object.fromEntries(vals.map((v, i) => [["Sep 2026", "Jun 2026", "Mar 2026", "Dec 2025", "Sep 2025", "Jun 2025", "Mar 2025", "Dec 2024"][i], v]));
  const y = (vals: number[]) => Object.fromEntries(vals.map((v, i) => [`Mar ${2026 - i}`, v]));
  const bundle: any = {
    quarter_results: { Sales: q([40, 30, 20, 10, 20, 15, 10, 5]), "Net Profit": q([4, 3, 2, 1, 2, 1, 1, 1]) },
    yoy_results: { Sales: y([100, 90, 80, 50]), "Net Profit": y([10, 8, 6, 5]) },
    balancesheet: { "Equity Capital": y([10]), Reserves: y([90]), Borrowings: y([50]) },
  };
  it("adds the last four quarters and compounds annual growth", () => {
    const f = computeFundamentals(bundle, { face_value: 10 }, null, null).fund;
    expect(f.sales).toBe(100);
    expect(f.np).toBe(10);
    expect(f.sales_g).toBe(100 / 50 * 100 - 100);
    expect(f.sales_g3).toBeCloseTo((Math.pow(100 / 50, 1 / 3) - 1) * 100, 3);
    expect(f.de).toBe(0.5);
  });
  it("leaves out lines a company doesn't report", () => {
    const f = computeFundamentals({ quarter_results: { Revenue: q([1, 2, 3, 4]) } } as any, { face_value: null }, null, null).fund;
    expect(f.sales).toBe(10);
    expect(f.opm).toBeNull();
    expect(f.roce).toBeNull();
    expect(f.shares).toBeNull();
  });
  it("prefers Dhan's market cap for the share count", () => {
    const f = computeFundamentals(bundle, { face_value: 10 }, { market_cap_cr: 500, price: 50, pe: null, pe_to_sector: null, industry_pb: null }, null).fund;
    expect(f.shares).toBe(10);
  });
});

describe("blob store", () => {
  it("splits a large binary across parts and reads it back", async () => {
    const rows = new Map<number, string>();
    const env: any = { DB: { prepare: (sql: string) => ({ bind: (...a: any[]) => ({
      run: async () => { rows.set(a[1], a[3]); },
      first: async () => (rows.has(a[1]) ? { body: rows.get(a[1]) } : null),
    }) }) } };
    const size = PART_BYTES + 1000;
    const data = new Uint8Array(size).map((_, i) => i % 251);
    const w = new BinaryWriter(env, "x", "b1");
    await w.add(data.subarray(0, 700));
    await w.add(data.subarray(700));
    const { parts, bytes } = await w.close();
    expect(parts).toBe(2);
    expect(bytes).toBe(size);
    const back = await readBinary(env, "x", "b1", parts, bytes);
    expect(back).toEqual(data);
  });
  it("round-trips floats", () => {
    expect([...base64ToFloats(floatsToBase64(Float32Array.from([1.5, 2.5])))]).toEqual([1.5, 2.5]);
    expect(base64ToFloats(null).length).toBe(0);
  });
});

describe("the catalogue", () => {
  it("leaves out the blocked screens", () => {
    for (const id of ["S005", "S010", "S012", "S022", "S023", "S031", "S040", "S043", "S047", "S050", "S060", "S066", "S071", "S072", "S076", "S077", "S079", "S086", "S087", "S093"]) {
      expect(SCREENS.find((s) => s.id === id)).toBeUndefined();
    }
  });
  it("compiles the corrected candle patterns as defined", () => {
    const n = compileScreen(SCREENS.find((s) => s.id === "S128")!);
    expect(JSON.stringify(n)).toContain('"op":"*"');
  });
});
