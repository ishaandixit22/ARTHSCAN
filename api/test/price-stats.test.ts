import { describe, expect, it } from "vitest";
import { beta, type Candle, type Day, extremes, monthlyCandles, returns, rollUpIntraday, seasonality, technicals, volumeAnalysis, weeklyCandles } from "../src/lib/price-stats.js";

const day = (date: string, close: number, extra: Partial<Day> = {}): Day => ({ date, open: close, high: close, low: close, close, volume: 100, ...extra });

describe("timeframes", () => {
  it("rolls daily bars into Monday weeks and calendar months", () => {
    const days = [day("2026-10-29", 10, { high: 12 }), day("2026-10-30", 11, { low: 9 }), day("2026-11-02", 13), day("2026-11-03", 12)];
    const weeks = weeklyCandles(days);
    expect(weeks).toHaveLength(2);
    expect(weeks[0].slice(1)).toEqual([10, 12, 9, 11, 200]);
    const months = monthlyCandles(days);
    expect(months).toHaveLength(2);
    expect(months[1].slice(1)).toEqual([13, 13, 12, 12, 200]);
  });

  it("counts intraday bars from the 09:15 open", () => {
    const open = Date.parse("2026-11-03T09:15:00+05:30") / 1000;
    const bars: Candle[] = [0, 1, 2, 3].map((m) => [open + m * 60, 10 + m, 20 + m, 5, 10 + m, 1]);
    const rolled = rollUpIntraday(bars, 3);
    expect(rolled).toHaveLength(2);
    expect(rolled[0]).toEqual([open, 10, 22, 5, 12, 3]);
    expect(rolled[1][0]).toBe(open + 180);
  });

  it("keeps two days' bars apart", () => {
    const a = Date.parse("2026-11-02T15:29:00+05:30") / 1000, b = Date.parse("2026-11-03T09:15:00+05:30") / 1000;
    expect(rollUpIntraday([[a, 1, 1, 1, 1, 1], [b, 2, 2, 2, 2, 1]], 15)).toHaveLength(2);
  });
});

describe("returns", () => {
  it("measures from the last close on or before each date", () => {
    const r = returns([day("2024-11-01", 50), day("2025-11-03", 80), day("2025-12-31", 100), day("2026-10-02", 90), day("2026-10-27", 110), day("2026-11-03", 120)])!;
    expect(r.ytd).toBe(20);
    expect(r.y1).toBe(50);
    expect(r.y2).toBe(140);
    expect(r.w1).toBeCloseTo(9.09, 2);
    expect(r.y5).toBeNull();
  });
});

describe("seasonality", () => {
  const days = [day("2024-10-31", 100), day("2024-11-29", 110), day("2024-12-31", 121), day("2025-10-31", 121), day("2025-11-28", 96.8), day("2025-12-31", 100), day("2026-01-05", 500)];
  const { months, by_year } = seasonality(days);
  const nov = months[10];

  it("reads each month against the close of the month before", () => {
    expect(nov.years).toBe(2);
    expect(nov.positive).toBe(1);
    expect(nov.max_positive).toEqual({ pct: 10, year: 2024 });
    expect(nov.max_negative).toEqual({ pct: -20, year: 2025 });
    expect(nov.avg_change).toBe(-5);
    expect(by_year["2024"][10]).toBe(10);
  });

  it("leaves out the month in progress and the month of listing", () => {
    expect(months[0].years).toBe(0);
    expect(by_year["2024"][9]).toBeNull();
  });
});

describe("extremes and beta", () => {
  it("takes the 52-week range from the last year only", () => {
    const e = extremes([day("2020-01-01", 10, { high: 90, low: 2 }), day("2021-06-01", 50, { high: 60 }), day("2022-01-01", 8, { low: 5 })])!;
    expect(e.high).toBe(90);
    expect(e.high_52w).toBe(60);
    expect(e.low_52w).toBe(5);
  });
  it("finds the all-time high and low with their dates", () => {
    const e = extremes([day("2020-01-01", 10), day("2021-01-01", 50, { high: 60 }), day("2022-01-01", 8, { low: 5 })])!;
    expect(e).toMatchObject({ high: 60, high_date: "2021-01-01", low: 5, low_date: "2022-01-01", first_date: "2020-01-01" });
  });

  it("gives twice the index's moves a beta of 2", () => {
    const index: { date: string; close: number }[] = [], days: Day[] = [];
    let i = 100, s = 100;
    for (let n = 0; n < 100; n++) {
      const move = n % 2 ? 0.01 : -0.008;
      i *= 1 + move;
      s *= 1 + 2 * move;
      const date = new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10);
      index.push({ date, close: i });
      days.push(day(date, s));
    }
    expect(beta(days, index)).toBeCloseTo(2, 1);
  });

  it("gives no beta on too few shared sessions", () => {
    expect(beta([day("2026-01-01", 1), day("2026-01-02", 2)], [{ date: "2026-01-01", close: 1 }, { date: "2026-01-02", close: 2 }])).toBeNull();
  });
});

describe("technicals", () => {
  const rising = Array.from({ length: 260 }, (_, n) => day(new Date(Date.UTC(2025, 0, 1 + n)).toISOString().slice(0, 10), 100 + n, { high: 101 + n, low: 99 + n }));
  it("reads a steady rise as bullish against every average", () => {
    const t = technicals(rising)!;
    expect(t.trend).toBe("bullish");
    expect(t.averages.every((a) => a.sma_signal === "bullish")).toBe(true);
    expect(t.pivots.pivot).toBeCloseTo(359, 0);
  });
  it("gives no average it lacks the history for", () => {
    const t = technicals(rising.slice(0, 30))!;
    expect(t.averages.find((a) => a.period === 200)!.sma).toBeNull();
  });
});

describe("volume", () => {
  it("shows delivery only when every session in the window has it", () => {
    const days = [day("2026-11-02", 10, { volume: 100 }), day("2026-11-03", 10, { volume: 300 })];
    const rows = volumeAnalysis(days, new Map([["2026-11-03", 50]]));
    expect(rows[0]).toMatchObject({ label: "Latest", volume: 300, deliv_pct: 50, deliv_volume: 150 });
    expect(rows[1]).toMatchObject({ label: "Previous", volume: 100, deliv_pct: null });
    expect(rows[2]).toMatchObject({ deliv_pct: null });
  });
});
