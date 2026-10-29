import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { migrate, SqliteDatabase } from "../src/db/sqlite.js";
import type { Env } from "../src/env.js";
import { runDaily } from "../src/jobs/daily.js";

const db = new SqliteDatabase(":memory:");
const env = { DB: db } as unknown as Env;

beforeAll(() => {
  migrate(db);
  db.raw.exec(`INSERT INTO stocks (symbol, name) VALUES ('AAA', 'Aaa Ltd');
    INSERT INTO daily_prices (symbol, date, close, prev_close, volume, turnover) VALUES ('AAA', '2026-10-28', 100, 99, 1000, 100000);`);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("scheduled daily refresh", () => {
  it("on a day with no bhavcopy, still loads FII/DII and the ban list, and leaves metrics alone", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-29T13:00:00Z"));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("fiidiiTradeReact")) return new Response(JSON.stringify([
        { category: "DII", date: "29-Oct-2026", buyValue: "18458.64", sellValue: "16534.23", netValue: "1924.41" },
        { category: "FII/FPI", date: "29-Oct-2026", buyValue: "13400.29", sellValue: "14343.89", netValue: "-943.6" },
      ]));
      if (url.includes("fo_secban_29102026")) return new Response("Securities in Ban For Trade Date 29-OCT-2026:\n1,SAIL\n");
      return new Response("not found", { status: 404 });
    }));
    const r = await runDaily(env, { results: 0 });
    const by = Object.fromEntries(r.steps.map((s) => [s.step, s]));
    expect(by.prices.status).toBe("skipped");
    expect(by["fii/dii"]).toMatchObject({ status: "ok", rows: 2 });
    expect(by["f&o ban"]).toMatchObject({ status: "ok", rows: 1 });
    expect(by.metrics.status).toBe("skipped");
    expect(db.raw.prepare("SELECT net_value FROM fii_dii WHERE date = '2026-10-29' AND category = 'FII'").get()).toEqual({ net_value: -943.6 });
    expect(db.raw.prepare("SELECT symbol FROM fo_ban WHERE date = '2026-10-29'").all()).toEqual([{ symbol: "SAIL" }]);
    expect((db.raw.prepare("SELECT COUNT(*) AS n FROM pipeline_runs WHERE job LIKE 'daily:%'").get() as { n: number }).n).toBe(r.steps.length);
  });

  it("records a step that fails and carries on with the rest", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.includes("fiidiiTradeReact") ? new Response("<html>blocked</html>", { status: 403 }) : new Response("", { status: 404 })));
    const r = await runDaily(env, { results: 0 });
    expect(r.steps.find((s) => s.step === "fii/dii")).toMatchObject({ status: "error" });
    expect(r.steps.find((s) => s.step === "f&o ban")?.status).toBe("skipped");
  });
});
