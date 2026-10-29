import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { migrate, SqliteDatabase } from "../src/db/sqlite.js";
import type { Env } from "../src/env.js";
import { growth, quarterLabel, shiftQuarter, verdict } from "../src/handlers/earnings.js";

const db = new SqliteDatabase(":memory:");
const env: Env = { DB: db, PUBLIC_SITE_ORIGIN: "https://arthscan.me", TOKEN_PEPPER: "p", INTERNAL_API_KEY: "i", FREE_DAILY_QUOTA: "50" };
const get = async (path: string) => {
  const res = await app.fetch(new Request(`https://x${path}`, { headers: { "x-internal-key": "i" } }), env);
  return (await res.json()) as any;
};

beforeAll(() => {
  migrate(db);
  const q = (sym: string, end: string, rev: number, op: number, np: number) =>
    `('${sym}', '${end}', 'Q', 1, ${rev}, ${op}, ${np}, 1)`;
  const rows: string[] = [];
  // Ten companies so the quarter clears the "at least 10 reporters" bar.
  for (let i = 0; i < 8; i++) rows.push(q(`F${i}`, "2026-09-30", 100, 10, 10), q(`F${i}`, "2025-09-30", 100, 10, 10));
  rows.push(
    q("GROW", "2025-09-30", 1000, 100, 100), q("GROW", "2026-06-30", 1100, 120, 110), q("GROW", "2026-09-30", 1200, 150, 130),
    q("TURN", "2025-09-30", 500, 10, -20), q("TURN", "2026-09-30", 450, 40, 15),
  );
  db.raw.exec(`
    INSERT INTO stocks (symbol, name, sector) VALUES ('GROW', 'Grow Ltd', 'IT'), ('TURN', 'Turn Ltd', 'Metals'),
      ${Array.from({ length: 8 }, (_, i) => `('F${i}', 'Flat ${i}', 'IT')`).join(", ")};
    INSERT INTO financials (symbol, period_end, period_type, consolidated, revenue, operating_profit, net_profit, eps) VALUES ${rows.join(", ")};
  `);
});
afterEach(() => vi.unstubAllGlobals());

describe("results season helpers", () => {
  it("labels Indian financial-year quarters and steps between them", () => {
    expect(quarterLabel("2026-09-30")).toEqual({ short: "Q2 FY27", span: "Jul–Sep 2026" });
    expect(quarterLabel("2027-03-31")).toEqual({ short: "Q4 FY27", span: "Jan–Mar 2027" });
    expect(shiftQuarter("2026-09-30", 3)).toBe("2026-06-30");
    expect(shiftQuarter("2026-09-30", 12)).toBe("2025-09-30");
    expect(shiftQuarter("2027-03-31", 3)).toBe("2026-12-31");
  });

  it("grows only from a positive base and reads the quarter in one word", () => {
    expect(growth(130, 100)).toBe(30);
    expect(growth(15, -20)).toBeNull();
    expect(verdict(20, 130, 100, 30)).toBe("Growing");
    expect(verdict(-10, 15, -20, null)).toBe("Back to profit");
    expect(verdict(5, -3, 10, null)).toBe("Loss");
    expect(verdict(-5, 90, 100, -10)).toBe("Shrinking");
    expect(verdict(10, 90, 100, -10)).toBe("Mixed");
  });
});

describe("get_earnings_season", () => {
  it("computes growth, verdicts, the summary and sectors from stored results", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]"))); // NSE calendar: nothing pending
    const d = (await get("/v1/market/earnings-season")).data;
    expect(d.quarter).toMatchObject({ end: "2026-09-30", short: "Q2 FY27" });
    const grow = d.companies[0];
    expect(grow).toMatchObject({ symbol: "GROW", sales_yoy: 20, sales_qoq: 9.1, profit_yoy: 30, profit_qoq: 18.2, opm: 12.5, opm_change: 2.5, verdict: "Growing" });
    expect(grow.trend.map((t: any) => t.net_profit)).toEqual([100, 110, 130]);
    expect(d.companies.find((c: any) => c.symbol === "TURN")).toMatchObject({ verdict: "Back to profit", profit_yoy: null });
    expect(d.summary).toMatchObject({ declared: 10, comparable: 9, grew: 9, declined: 0, median_profit_yoy: 0, pending: 0 });
    expect(d.sectors[0]).toMatchObject({ sector: "IT", companies: 9 });
  });

  it("sorts and filters without changing the summary", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]")));
    const d = (await get("/v1/market/earnings-season?sort=profit_growth&result=Growing&limit=2")).data;
    expect(d.companies.map((c: any) => c.symbol)[0]).toBe("GROW");
    expect(d.companies).toHaveLength(2);
    expect(d.summary.declared).toBe(10);
    expect((await get("/v1/market/earnings-season?sector=Metals")).data.companies.map((c: any) => c.symbol)).toEqual(["TURN"]);
  });
});
