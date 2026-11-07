import { strToU8, zipSync } from "fflate";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { migrate, SqliteDatabase } from "../src/db/sqlite.js";
import type { Env } from "../src/env.js";
import { selfCheck } from "../src/jobs/check.js";

const db = new SqliteDatabase(":memory:");
const env = { DB: db } as unknown as Env;

const bhavcopy = (rows: string[]) => zipSync({
  "bhav.csv": strToU8(["TckrSymb,SctySrs,FinInstrmNm,ISIN,OpnPric,HghPric,LwPric,ClsPric,PrvsClsgPric,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd", ...rows].join("\n")),
});

beforeAll(() => {
  migrate(db);
  db.raw.exec(`INSERT INTO stocks (symbol, name) VALUES ('AAA', 'Aaa Ltd');
    INSERT INTO daily_prices (symbol, date, close, prev_close, volume, turnover) VALUES
      ('AAA', '2026-11-02', 98, 97, 1000, 98000), ('AAA', '2026-11-03', 99, 98, 1000, 99000),
      ('AAA', '2026-11-04', 100, 99, 1000, 100000), ('AAA', '2026-11-05', 101, 100, 1000, 101000);`);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("daily self-check", () => {
  it("on Saturday morning, loads Friday's session that the evening runs missed", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      asked.push(url);
      if (url.includes("BhavCopy_NSE_CM_0_0_0_20261106_")) return new Response(bhavcopy(["AAA,EQ,Aaa Ltd,INE000A01010,101,104,100,103,101,1200,123600,40"]));
      return new Response("not found", { status: 404 });
    }));
    const r = await selfCheck(env, Date.parse("2026-11-07T04:30:00Z"));

    expect(r.latest_published).toBe("2026-11-06");
    expect(r.latest_loaded).toBe("2026-11-06");
    expect(r.items.find((i) => i.check === "session 2026-11-06")).toMatchObject({ status: "fixed" });
    expect(db.raw.prepare("SELECT close FROM daily_prices WHERE symbol = 'AAA' AND date = '2026-11-06'").get()).toEqual({ close: 103 });
    // Sessions already loaded aren't asked for again.
    expect(asked.some((u) => u.includes("20261105"))).toBe(false);
    expect(db.raw.prepare("SELECT body FROM external_cache WHERE key = 'health:last_check'").get()).toBeTruthy();
    expect((db.raw.prepare("SELECT COUNT(*) AS n FROM pipeline_runs WHERE job LIKE 'check:%'").get() as { n: number }).n).toBe(r.items.length);
  });

  it("the next day finds nothing missing and reloads nothing", async () => {
    const fetchMock = vi.fn(async () => new Response("not found", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await selfCheck(env, Date.parse("2026-11-08T04:30:00Z"));
    expect(r.items.find((i) => i.check === "sessions")).toMatchObject({ status: "ok" });
    expect(r.items.some((i) => i.status === "fixed" && i.check.startsWith("session"))).toBe(false);
    expect(fetchMock.mock.calls.every(([u]) => !String(u).includes("BhavCopy"))).toBe(true);
  });

  it("before 18:00 IST doesn't expect today's file yet", async () => {
    const fetchMock = vi.fn(async () => new Response("not found", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    await selfCheck(env, Date.parse("2026-11-09T06:00:00Z")); // Monday 11:30 IST
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("20261109"))).toBe(false);
  });
});
