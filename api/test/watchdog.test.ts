import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { migrate, SqliteDatabase } from "../src/db/sqlite.js";
import type { Env } from "../src/env.js";
import { selfCheck } from "../src/jobs/check.js";
import { dataProblems, watchdog, watchdogState } from "../src/jobs/watchdog.js";
import { unlistedSpecialSessions } from "../src/lib/market-hours.js";

const ist = (s: string) => Date.parse(`${s}+05:30`);
const bhavcopy = zipSync({
  "bhav.csv": strToU8(["TckrSymb,SctySrs,FinInstrmNm,ISIN,OpnPric,HghPric,LwPric,ClsPric,PrvsClsgPric,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd", "AAA,EQ,Aaa Ltd,INE000A01010,101,104,100,103,101,1200,123600,50"].join("\n")),
});

let db: SqliteDatabase;
let env: Env;
let sent: string[];
let asked: string[];
/** What NSE does for bhavcopy requests: a date's file, a refusal, or nothing. */
let nse: { file?: string; refuse?: boolean; holidays?: { tradingDate: string; description: string }[] };

beforeEach(() => {
  db = new SqliteDatabase(":memory:");
  migrate(db);
  db.raw.exec("INSERT INTO stocks (symbol, name) VALUES ('AAA', 'Aaa Ltd'); INSERT INTO daily_prices (symbol, date, close, prev_close, volume, turnover) VALUES ('AAA', '2026-11-06', 101, 100, 1000, 101000);");
  env = { DB: db, RESEND_API_KEY: "re_test", ALERT_EMAIL_TO: "me@example.com" } as unknown as Env;
  sent = [];
  asked = [];
  nse = {};
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("resend.com")) {
      sent.push(JSON.parse(String(init?.body)).subject);
      return new Response("{}");
    }
    asked.push(url);
    if (url.includes("holiday-master")) return nse.holidays ? new Response(JSON.stringify({ CM: nse.holidays })) : new Response("no", { status: 404 });
    if (url.includes("BhavCopy_NSE_CM")) {
      if (nse.refuse) return new Response("forbidden", { status: 403 });
      if (nse.file && url.includes(nse.file)) return new Response(bhavcopy as unknown as BodyInit);
    }
    return new Response("not found", { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const bhavAsked = () => asked.filter((u) => u.includes("BhavCopy_NSE_CM")).length;
const pricesOn = (d: string) => (db.raw.prepare("SELECT COUNT(*) AS n FROM daily_prices WHERE date = ?").get(d) as { n: number }).n;

describe("evening watchdog", () => {
  it("does nothing before the 18:15 run has finished", async () => {
    expect(await watchdog(env, ist("2026-11-09T18:07:00"))).toBeNull();
    expect(asked).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("loads a published session the scheduled run missed, and says so once", async () => {
    nse.file = "20261109";
    const first = await watchdog(env, ist("2026-11-09T18:22:00"));
    expect(first).toMatchObject({ status: "loaded", repaired: true });
    expect(pricesOn("2026-11-09")).toBe(1);
    expect(sent).toEqual(["Arthscan: 2026-11-09 prices were missing and are now loaded"]);

    await watchdog(env, ist("2026-11-09T18:37:00"));
    expect(sent).toHaveLength(1);
  });

  it("stays quiet and leaves NSE alone when the scheduled run already loaded it", async () => {
    db.raw.exec("INSERT INTO daily_prices (symbol, date, close, prev_close, volume, turnover) VALUES ('AAA', '2026-11-09', 103, 101, 1000, 103000); INSERT INTO stock_metrics (symbol, as_of) VALUES ('AAA', '2026-11-09');");
    expect(await watchdog(env, ist("2026-11-09T18:22:00"))).toMatchObject({ status: "loaded", repaired: false });
    expect(bhavAsked()).toBe(0);
    expect(sent).toEqual([]);
  });

  it("recomputes metrics if a run stopped before them", async () => {
    db.raw.exec("INSERT INTO daily_prices (symbol, date, close, prev_close, volume, turnover) VALUES ('AAA', '2026-11-09', 103, 101, 1000, 103000);");
    await watchdog(env, ist("2026-11-09T18:22:00"));
    expect((db.raw.prepare("SELECT MAX(as_of) AS d FROM stock_metrics").get() as { d: string }).d).toBe("2026-11-09");
  });

  it("keeps a 403 quiet until 19:45, alerts once, then reports the recovery", async () => {
    nse.refuse = true;
    expect(await watchdog(env, ist("2026-11-09T18:22:00"))).toMatchObject({ status: "waiting" });
    expect(sent).toEqual([]);

    expect(await watchdog(env, ist("2026-11-09T19:52:00"))).toMatchObject({ status: "missing", alerted: true });
    await watchdog(env, ist("2026-11-09T20:07:00"));
    expect(sent).toEqual(["Arthscan alert: 2026-11-09 prices are not loaded"]);

    nse = { file: "20261109" };
    expect(await watchdog(env, ist("2026-11-09T20:22:00"))).toMatchObject({ status: "loaded", repaired: true });
    expect(sent).toHaveLength(2);
    expect(pricesOn("2026-11-09")).toBe(1);
  });

  it("logs a refusal, so the miss can be explained later", async () => {
    nse.refuse = true;
    await watchdog(env, ist("2026-11-09T18:22:00"));
    expect(db.raw.prepare("SELECT status, message FROM pipeline_runs WHERE job = 'watchdog'").get()).toMatchObject({ status: "error", message: expect.stringContaining("403") });
  });

  it("doesn't alert on a normal weekend", async () => {
    expect(await watchdog(env, ist("2026-11-14T20:07:00"))).toMatchObject({ status: "waiting", alerted: false });
    expect(sent).toEqual([]);
  });

  it("doesn't alert on a weekday market holiday", async () => {
    nse.holidays = [{ tradingDate: "10-Nov-2026", description: "Diwali-Balipratipada" }];
    expect(await watchdog(env, ist("2026-11-10T20:07:00"))).toMatchObject({ status: "waiting", alerted: false });
    expect(sent).toEqual([]);
  });

  it("loads a weekend session nobody listed", async () => {
    nse.file = "20261114";
    expect(await watchdog(env, ist("2026-11-14T18:22:00"))).toMatchObject({ status: "loaded" });
    expect(pricesOn("2026-11-14")).toBe(1);
  });

  it("starts a new day with a clean slate", async () => {
    nse.refuse = true;
    await watchdog(env, ist("2026-11-09T19:52:00"));
    await watchdog(env, ist("2026-11-11T19:52:00"));
    expect(sent).toEqual(["Arthscan alert: 2026-11-09 prices are not loaded", "Arthscan alert: 2026-11-11 prices are not loaded"]);
    expect((await watchdogState(env))?.date).toBe("2026-11-11");
  });
});

describe("the /health route", () => {
  const health = async () => (await app.request("/health", {}, env)).json() as Promise<any>;

  it("says so when a session is missing, and shows the refused attempt", async () => {
    nse.refuse = true;
    await watchdog(env, ist("2026-11-09T19:52:00"));
    const h = await health();
    expect(h.ok).toBe(false);
    expect(h.problems[0]).toContain("403");
    expect(h.watchdog).toMatchObject({ date: "2026-11-09", status: "missing" });
    expect(h.recent_refreshes[0]).toMatchObject({ job: "watchdog", status: "error" });
    expect(h.watchdog.alerted).toBeUndefined();
  });

  it("clears once the session is loaded", async () => {
    nse.refuse = true;
    await watchdog(env, ist("2026-11-09T19:52:00"));
    nse = { file: "20261109" };
    await watchdog(env, ist("2026-11-09T20:07:00"));
    const h = await health();
    expect(h.watchdog.status).toBe("loaded");
    expect(h.latest_price_date).toBe("2026-11-09");
    expect(h.problems.filter((p: string) => !p.includes("days old"))).toEqual([]);
  });
});

describe("what /health reports", () => {
  const now = ist("2026-11-09T20:00:00");
  const state = (over: object) => ({ date: "2026-11-09", status: "missing", message: "NSE refused", checked_at: "", alerted: true, repaired: false, ...over }) as never;

  it("is clean when the data is current", () => {
    expect(dataProblems({ prices: "2026-11-09", metrics: "2026-11-09" }, state({ status: "loaded" }), "2026-11-09", now)).toEqual([]);
  });
  it("is clean while waiting for today's file", () => {
    expect(dataProblems({ prices: "2026-11-06", metrics: "2026-11-06" }, state({ status: "waiting" }), "2026-11-06", now)).toEqual([]);
  });
  it("reports a session the watchdog found missing", () => {
    expect(dataProblems({ prices: "2026-11-06", metrics: "2026-11-06" }, state({}), "2026-11-06", now)).toEqual(["NSE refused"]);
  });
  it("stops reporting once the session is in", () => {
    expect(dataProblems({ prices: "2026-11-09", metrics: "2026-11-09" }, state({}), null, now)).toEqual([]);
  });
  it("reports published data that isn't loaded", () => {
    expect(dataProblems({ prices: "2026-11-05", metrics: "2026-11-05" }, null, "2026-11-06", now)[0]).toContain("NSE has published 2026-11-06");
  });
  it("reports metrics behind prices", () => {
    expect(dataProblems({ prices: "2026-11-06", metrics: "2026-11-05" }, null, null, now)[0]).toContain("metrics");
  });
  it("reports old prices even if the watchdog has stopped running", () => {
    expect(dataProblems({ prices: "2026-10-30", metrics: "2026-10-30" }, null, null, now)[0]).toContain("days old");
  });
  it("reports having no prices", () => {
    expect(dataProblems({}, null, null, now)).toEqual(["No prices stored"]);
  });
});

describe("special sessions NSE marks but we haven't listed", () => {
  const today = "2026-11-08";
  it("finds a marked date ahead that isn't listed", () => {
    expect(unlistedSpecialSessions([{ date: "2026-12-20", name: "Some Festival*" }, { date: "2026-12-25", name: "Christmas" }], today)).toEqual([{ date: "2026-12-20", name: "Some Festival" }]);
  });
  it("accepts one that's listed, and ignores past dates and ones too far off", () => {
    expect(unlistedSpecialSessions([{ date: "2026-11-08", name: "Diwali Laxmi Pujan*" }, { date: "2026-10-01", name: "Past*" }, { date: "2027-06-01", name: "Far off*" }], today)).toEqual([]);
  });
  it("puts a warning in the morning summary", async () => {
    nse.holidays = [{ tradingDate: "20-Dec-2026", description: "Some Festival*" }];
    const r = await selfCheck(env, ist("2026-11-08T10:00:00"));
    expect(r.items.find((i) => i.check === "special sessions")).toMatchObject({ status: "behind", message: expect.stringContaining("2026-12-20") });
  });
  it("adds nothing if NSE's list can't be read", async () => {
    const r = await selfCheck(env, ist("2026-11-08T10:00:00"));
    expect(r.items.find((i) => i.check === "special sessions")).toBeUndefined();
  });
});
