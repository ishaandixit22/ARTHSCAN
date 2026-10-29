import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { migrate, SqliteDatabase } from "../src/db/sqlite.js";
import type { Env } from "../src/env.js";

const db = new SqliteDatabase(":memory:");
const env: Env = { DB: db, PUBLIC_SITE_ORIGIN: "https://arthscan.me", TOKEN_PEPPER: "p", INTERNAL_API_KEY: "i", FREE_DAILY_QUOTA: "50" };
const get = async (path: string) => ((await (await app.fetch(new Request(`https://x${path}`, { headers: { "x-internal-key": "i" } }), env)).json()) as any).data;

beforeAll(() => {
  migrate(db);
  db.raw.exec(`
    INSERT INTO stocks (symbol, name, sector) VALUES
      ('BANKA', 'Bank A', 'Financial Services'), ('BANKB', 'Bank B', 'Financial Services'), ('ITA', 'IT A', 'Information Technology');
    INSERT INTO stock_metrics (symbol, as_of, close, change_pct, turnover, ret_1m, sma_50, rsi_14, macd, macd_hist, vol_ratio, cross_signal, cross_date, breakout, deliv_pct, deliv_pct_avg_20) VALUES
      ('BANKA', '2026-10-28', 100, 2,  3e9, 5,  90,  25, 1.2, 0.4, 4.2, 'golden', '2026-10-27', 'high', 70, 40),
      ('BANKB', '2026-10-28', 50,  -1, 1e9, 1,  60,  55, -1,  -0.2, 1.1, NULL, NULL, NULL, 30, 35),
      ('ITA',   '2026-10-28', 800, 1,  2e9, -3, 820, 75, 2,  0.5, 0.9, 'death', '2026-10-25', 'low', 55, 50),
      ('LIQETF','2026-10-28', 100, 0.01, 9e9, 0.5, 99, 99, 0.1, 0.1, 5, NULL, NULL, 'high', 99, 80);
    INSERT INTO stocks (symbol, name, instrument_type) VALUES ('LIQETF', 'Liquid ETF', 'ETF');
    INSERT INTO index_daily (index_name, date, close, change_pct, turnover_cr, pe, pb, div_yield) VALUES
      ('Nifty 50', '2026-10-27', 22749, 0.3, 30000, 19.4, 2.8, 1.4),
      ('Nifty 50', '2026-10-28', 22698, -0.2, 30152, 18.99, 2.79, 1.43),
      ('Nifty Bank', '2026-10-28', 48000, 0.5, 9000, 14.1, 2.1, 0.9);
    INSERT INTO fo_ban (date, symbol) VALUES ('2026-10-28', 'SAIL'), ('2026-10-27', 'SAIL'), ('2026-10-27', 'IDEA');
    INSERT INTO fo_ban_days (date, stocks) VALUES ('2026-10-28', 1), ('2026-10-27', 2);
  `);
});

describe("market insights", () => {
  it("groups the heatmap by sector with turnover-weighted change", async () => {
    const d = await get("/v1/market/heatmap");
    const fin = d.sectors.find((s: any) => s.sector === "Financial Services");
    expect(d.sectors[0].sector).toBe("Financial Services"); // most turnover
    expect(fin.change).toBe(1.25); // (2×3e9 + −1×1e9) / 4e9
    expect(fin.stocks.map((s: any) => s.symbol)).toEqual(["BANKA", "BANKB"]);
  });

  it("returns signals by definition", async () => {
    expect((await get("/v1/market/signals?signal=rsi_oversold")).results.map((r: any) => r.symbol)).toEqual(["BANKA"]);
    expect((await get("/v1/market/signals?signal=death_cross")).results.map((r: any) => r.symbol)).toEqual(["ITA"]);
    expect((await get("/v1/market/signals?signal=volume_spike")).results.map((r: any) => r.symbol)).toEqual(["BANKA"]);
    expect((await get("/v1/market/signals?signal=macd_bearish")).results.map((r: any) => r.symbol)).toEqual(["BANKB"]);
  });

  it("ranks deliveries by % or by jump over the 20-day average", async () => {
    expect((await get("/v1/market/deliveries?min_turnover_cr=1")).results.map((r: any) => r.symbol)).toEqual(["BANKA", "ITA", "BANKB"]);
    expect((await get("/v1/market/deliveries?sort=deliv_jump&min_turnover_cr=1")).results[0].symbol).toBe("BANKA");
  });

  it("lists latest index valuations and one index's history with its P/E percentile", async () => {
    const all = await get("/v1/market/valuations");
    expect(all.as_of).toBe("2026-10-28");
    expect(all.indices.map((i: any) => i.index_name)).toEqual(["Nifty 50", "Nifty Bank"]);
    const n50 = await get("/v1/market/valuations?index=Nifty%2050");
    expect(n50.history.map((h: any) => h.date)).toEqual(["2026-10-27", "2026-10-28"]);
    expect(n50.pe_range.current_percentile).toBe(50);
  });

  it("keeps ETFs out of market-wide lists", async () => {
    expect((await get("/v1/market/signals?signal=breakout_high")).results.map((r: any) => r.symbol)).toEqual(["BANKA"]);
    expect((await get("/v1/market/deliveries?min_turnover_cr=1")).results.map((r: any) => r.symbol)).not.toContain("LIQETF");
    expect((await get("/v1/market/heatmap")).sectors.flatMap((g: any) => g.stocks.map((x: any) => x.symbol))).not.toContain("LIQETF");
  });

  it("shows the F&O ban list for the latest date and history", async () => {
    const d = await get("/v1/market/fo-ban");
    expect(d.latest).toEqual({ date: "2026-10-28", symbols: ["SAIL"] });
    expect(d.history[1].symbols).toEqual(["IDEA", "SAIL"]);
  });

  it("ranks sectors by median 1-month return with breadth", async () => {
    const d = await get("/v1/market/sector-rotation");
    expect(d.sectors[0]).toMatchObject({ sector: "Financial Services", stocks: 2, pct_above_sma50: 50 });
  });
});

describe("F&O ban with open interest", () => {
  it("serves the newest published day, NIL days included, and the stocks near the limit", async () => {
    const db2 = new SqliteDatabase(":memory:");
    migrate(db2);
    db2.raw.exec(`
      INSERT INTO stocks (symbol, name) VALUES ('KAYNES', 'Kaynes Technology'), ('MANAPPURAM', 'Manappuram Finance');
      INSERT INTO fo_ban VALUES ('2026-10-28', 'SAIL'), ('2026-10-29', 'KAYNES'), ('2026-10-29', 'SAIL');
      INSERT INTO fo_ban_days VALUES ('2026-10-27', 0), ('2026-10-28', 1), ('2026-10-29', 2);
      INSERT INTO fo_oi VALUES
        ('2026-10-28', 'KAYNES', 100, 130, 95.67, 95.67, 'No Fresh Positions'),
        ('2026-10-28', 'MANAPPURAM', 100, 90, 89.7, 89.7, '4355898'),
        ('2026-10-28', 'IDEA', 100, 80, 78, 78, '1367739742');
    `);
    const res = await app.fetch(new Request("https://x/v1/market/fo-ban", { headers: { "x-internal-key": "i" } }), { ...env, DB: db2 });
    const d = ((await res.json()) as any).data;
    expect(d.latest).toEqual({ date: "2026-10-29", symbols: ["KAYNES", "SAIL"] });
    expect(d.history.map((h: any) => h.date)).toEqual(["2026-10-29", "2026-10-28", "2026-10-27"]);
    expect(d.history[2].symbols).toEqual([]);
    expect(d.open_interest.near.map((n: any) => [n.symbol, n.in_ban])).toEqual([["KAYNES", true], ["MANAPPURAM", false]]);
  });
});
