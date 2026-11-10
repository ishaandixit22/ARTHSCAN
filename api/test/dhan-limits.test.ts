import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { migrate, SqliteDatabase } from "../src/db/sqlite.js";
import type { Env } from "../src/env.js";
import { bseHistoryTick } from "../src/jobs/bse.js";
import { companyInfo } from "../src/lib/dhan.js";

const ist = (s: string) => Date.parse(`${s}+05:30`);
const company = { data: { CO: [{ MARKET_CAP: 100 }], RATIOS: [{ PE_RATIO: 20 }], SHP: [{ FII_HOLDING: 5 }] } };
const refused = () => new Response(JSON.stringify({ errorCode: "DH-904" }), { status: 429 });

let db: SqliteDatabase;
let env: Env;
/** What Dhan answers to company info calls, in order; after these, it answers normally. */
let answers: (() => Response)[];
let dhanCalls: string[];

beforeEach(() => {
  db = new SqliteDatabase(":memory:");
  migrate(db);
  db.raw.exec(`INSERT INTO stocks (symbol, name, dhan_security_id) VALUES ('AAA', 'Aaa Ltd', '1');
    INSERT INTO bse_stocks (symbol, name, isin, dhan_security_id, bse_group, median_turnover) VALUES ('BBB', 'Bbb Ltd', 'INE000000101', '2', 'B', 100);`);
  env = {
    DB: db, DHAN_CLIENT_ID: "c", DHAN_ACCESS_TOKEN: "t", PUBLIC_SITE_ORIGIN: "https://arthscan.me", TOKEN_PEPPER: "p", INTERNAL_API_KEY: "i",
    FREE_DAILY_QUOTA: "50", AUTH_DEV_LOGIN: "true", INVITE_ONLY: "false", LIVE_ACCESS: "public",
    LIVE_FEED: { idFromName: () => "dhan", get: () => ({ fetch: async () => new Response("", { status: 404 }) }) },
  } as unknown as Env;
  answers = [];
  dhanCalls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (!url.includes("api.dhan.co")) return new Response("no", { status: 404 });
    dhanCalls.push(url);
    if (url.includes("companyinfo")) return (answers.shift() ?? (() => new Response(JSON.stringify(company))))();
    return new Response(JSON.stringify({ timestamp: [1], open: [1], high: [1], low: [1], close: [1], volume: [1] }));
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("company info when Dhan's limit is hit", () => {
  it("asks again and succeeds", async () => {
    answers = [refused, refused];
    expect((await companyInfo(env, "AAA")).ok).toBe(true);
    expect(dhanCalls).toHaveLength(3);
  });
  it("gives up after two more tries and reports the refusal", async () => {
    answers = [refused, refused, refused, refused];
    expect(await companyInfo(env, "AAA")).toMatchObject({ ok: false, upstream: 429 });
    expect(dhanCalls).toHaveLength(3);
  });
  it("doesn't retry other failures", async () => {
    answers = [() => new Response("{}", { status: 400 })];
    expect(await companyInfo(env, "AAA")).toMatchObject({ ok: false, upstream: 400 });
    expect(dhanCalls).toHaveLength(1);
  });
});

describe("the company info route", () => {
  const get = (path: string, headers: Record<string, string> = {}) => app.fetch(new Request(`https://arthscan.me${path}`, { headers }), env);

  it("answers the website's server", async () => {
    const r = await get("/api/live/company?symbol=AAA", { "x-internal-key": "i" });
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).overview.market_cap_cr).toBe(100);
  });
  it("refuses everyone else, without calling Dhan", async () => {
    expect((await get("/api/live/company?symbol=AAA")).status).toBe(403);
    expect((await get("/api/live/company?symbol=AAA&raw")).status).toBe(403);
    expect((await get("/api/live/company?symbol=AAA", { "x-internal-key": "wrong" })).status).toBe(403);
    expect(dhanCalls).toEqual([]);
  });
});

describe("BSE history batch", () => {
  it("waits while the market is open", async () => {
    expect(await bseHistoryTick(env, ist("2026-11-09T10:00:00"), { gapMs: 0 })).toEqual({ asked: 0, loaded: 0, failed: 0 });
    expect(dhanCalls).toEqual([]);
  });
  it("runs after the close", async () => {
    expect((await bseHistoryTick(env, ist("2026-11-09T20:00:00"), { gapMs: 0 })).asked).toBe(1);
    expect(dhanCalls).toHaveLength(1);
  });
});
