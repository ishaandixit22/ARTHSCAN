import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrate, SqliteDatabase } from "../src/db/sqlite.js";
import type { Env } from "../src/env.js";
import { isTradingDay, marketOpen, NSE_HOLIDAYS, tradingCalendar } from "../src/lib/market-hours.js";

const ist = (s: string) => Date.parse(`${s}+05:30`);

let db: SqliteDatabase;
let env: Env;
/** NSE's holiday-master answer, or null for a refusal. */
let nse: { tradingDate: string; description: string }[] | null;

beforeEach(() => {
  db = new SqliteDatabase(":memory:");
  migrate(db);
  env = { DB: db } as unknown as Env;
  nse = null;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("holiday-master")) return nse ? new Response(JSON.stringify({ CM: nse })) : new Response("forbidden", { status: 403 });
    return new Response("", { status: 403 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("NSE 2026 calendar", () => {
  it("closes NSE holidays on weekdays", async () => {
    for (const d of ["2026-01-26", "2026-03-03", "2026-11-10", "2026-11-24", "2026-12-25"]) expect(await isTradingDay(env, d), d).toBe(false);
  });
  it("opens ordinary weekdays and the Muhurat Sunday", async () => {
    for (const d of ["2026-11-09", "2026-11-11", "2026-11-08"]) expect(await isTradingDay(env, d), d).toBe(true);
    expect(await isTradingDay(env, "2026-11-15")).toBe(false); // an ordinary Sunday
  });
  it("keeps the market shut during holiday hours, even when NSE refuses", async () => {
    expect(await marketOpen(env, ist("2026-11-10T11:00:00"))).toBe(false);
    expect(await marketOpen(env, ist("2026-11-11T11:00:00"))).toBe(true);
  });
  it("the built-in list has every 2026 NSE holiday", () => expect(Object.keys(NSE_HOLIDAYS["2026"])).toHaveLength(20));
});

describe("each year's list from NSE", () => {
  it("uses NSE's live list and keeps a copy of it", async () => {
    nse = [{ tradingDate: "26-Jan-2027", description: "Republic Day" }, { tradingDate: "09-Mar-2027", description: "Holi" }];
    const cal = await tradingCalendar(env);
    expect(cal.source["2027"]).toBe("nse");
    expect(cal.source["2026"]).toBe("built-in");
    expect(await isTradingDay(env, "2027-03-09")).toBe(false);
    const saved = db.raw.prepare("SELECT body FROM external_cache WHERE key = 'nse-calendar:2027'").get() as { body: string };
    expect(JSON.parse(saved.body)).toEqual({ "2027-01-26": "Republic Day", "2027-03-09": "Holi" });
  });
  it("falls back to the stored copy when NSE refuses", async () => {
    db.raw.prepare("INSERT INTO external_cache (key, body, fetched_at) VALUES ('nse-calendar:2027', ?, 0)").run(JSON.stringify({ "2027-03-09": "Holi" }));
    const cal = await tradingCalendar(env);
    expect(cal.source["2027"]).toBe("saved");
    expect(cal.holidays.has("2027-03-09")).toBe(true);
  });
  it("a year with no list closes weekends only", async () => {
    expect(await isTradingDay(env, "2028-01-26")).toBe(true);
    expect(await isTradingDay(env, "2028-01-29")).toBe(false); // Saturday
  });
});
