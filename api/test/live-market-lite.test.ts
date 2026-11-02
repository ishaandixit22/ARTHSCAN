import { describe, expect, it } from "vitest";
import { liteMarket } from "../src/live/market.js";

describe("liteMarket", () => {
  it("shortens the lists and leaves every other figure as it was", () => {
    const row = (i: number) => ({ symbol: `S${i}`, change_pct: i / 3 });
    const rows = Array.from({ length: 50 }, (_, i) => row(i));
    const body = {
      status: { state: "live" }, stocks: 3047, breadth: { advances: 800 }, sectors: [{ sector: "IT", median_change: 1.234567 }], indices: [{ index_name: "Nifty 50", ltp: 23091.65 }],
      movers: { gainers: rows, losers: rows, active: rows },
      signals: { volume_spike: rows, breakout_high: rows, breakout_low: rows },
    };
    const lite = liteMarket(body);
    expect(lite.movers.gainers).toEqual(rows.slice(0, 8));
    expect(lite.signals.volume_spike).toEqual([]);
    expect({ ...lite, movers: 0, signals: 0 }).toEqual({ ...body, movers: 0, signals: 0 });
    expect(body.movers.gainers).toHaveLength(50);
  });
});
