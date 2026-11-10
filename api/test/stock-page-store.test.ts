// The stock page's stored parts: About (digests) and the long-history figures (price_stats), and the
// background fills that keep both ahead of visitors.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { migrate, SqliteDatabase } from "../src/db/sqlite.js";
import type { Env } from "../src/env.js";
import { fillPriceStats, priceStats } from "../src/lib/chart.js";
import { fillDigests } from "../src/lib/digest.js";

const db = new SqliteDatabase(":memory:");
const env: Env = { DB: db, PUBLIC_SITE_ORIGIN: "https://arthscan.me", TOKEN_PEPPER: "p", INTERNAL_API_KEY: "i", FREE_DAILY_QUOTA: "50", INDIANAPI_KEY: "k" };
const call = async (path: string) => {
  const res = await app.fetch(new Request(`https://x${path}`, { headers: { "x-internal-key": "i" } }), env);
  return { status: res.status, body: (await res.json()) as any };
};
const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);
// Tuesday 10 Nov 2026: 10:00 IST is in the session, 22:00 IST is after it.
const IN_SESSION = Date.parse("2026-11-10T04:30:00Z");
const EVENING = Date.parse("2026-11-10T16:30:00Z");

beforeAll(() => {
  migrate(db);
  const days = ["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09"];
  db.raw.exec(`INSERT INTO stocks (symbol, name) VALUES ('BIG', 'Big Co Limited'), ('SMALL', 'Small Co Limited'), ('NOPE', 'Unknown Co Limited'), ('GONE', 'Gone Co Limited');
    INSERT INTO stock_metrics (symbol, as_of, turnover) VALUES ('BIG', '2026-11-09', 900), ('SMALL', '2026-11-09', 100), ('NOPE', '2026-11-09', 300), ('GONE', '2026-09-01', 999);`);
  const ins = db.raw.prepare("INSERT INTO daily_prices (symbol, date, open, high, low, close, prev_close, volume, turnover) VALUES (?, ?, 10, 11, 9, ?, 10, 100, 1000)");
  for (const s of ["BIG", "SMALL"]) days.forEach((d, i) => ins.run(s, d, 10 + i));
});
afterEach(() => vi.unstubAllGlobals());

describe("About, stored ahead of visitors", () => {
  it("fills the largest companies first, remembers ones the provider doesn't know, and skips stocks that stopped trading", async () => {
    const f = vi.fn(async (url: string) => {
      const name = new URL(url).searchParams.get("name");
      if (name !== "BIG" && name !== "SMALL") return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ companyProfile: { companyDescription: `${name} makes things.` } }));
    });
    vi.stubGlobal("fetch", f);
    const r = await fillDigests(env, { maxRequests: 10, dailyCap: 100 });
    expect(r).toMatchObject({ asked: 3, stored: 2, unknown: 1, skipped: null });
    expect(new URL(f.mock.calls[0][0] as string).searchParams.get("name")).toBe("BIG");
    // GONE last traded months ago, so it isn't asked; a second batch has nothing left.
    expect(f.mock.calls.some((c) => String(c[0]).includes("GONE"))).toBe(false);
    expect((await fillDigests(env, { maxRequests: 10, dailyCap: 100 })).asked).toBe(0);
  });

  it("serves the stored copy at any age without the provider when asked for stored only", async () => {
    db.raw.prepare("UPDATE external_cache SET fetched_at = ? WHERE key = 'digest:BIG'").run(at("2026-01-01T00:00:00Z"));
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const r = await call("/v1/ext/digest?stock=BIG&stored=1");
    expect(r.status).toBe(200);
    expect(r.body.data.data.about).toBe("BIG makes things.");
    expect((await call("/v1/ext/digest?stock=NOPE&stored=1")).status).toBe(404);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("long-history figures, stored per session", () => {
  it("stays out of market hours, so it never competes with the intraday screens for Dhan's limit", async () => {
    expect(await fillPriceStats(env, { now: IN_SESSION })).toMatchObject({ asked: 0, skipped: "market hours" });
  });

  it("works out and stores every stock that misses its last session, largest first", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no network in tests"); }));
    const r = await fillPriceStats(env, { now: EVENING });
    expect(r).toMatchObject({ asked: 3, stored: 2, failed: 1 }); // NOPE has no stored prices to work from
    const rows = db.raw.prepare("SELECT symbol, as_of FROM price_stats ORDER BY symbol").all();
    expect(rows).toEqual([{ symbol: "BIG", as_of: "2026-11-09" }, { symbol: "NOPE", as_of: "2026-11-09" }, { symbol: "SMALL", as_of: "2026-11-09" }]);
    // The failure is noted for this session, so the next batch has nothing to do.
    expect((await fillPriceStats(env, { now: EVENING })).asked).toBe(0);
  });

  it("serves current stored figures without Dhan, and recomputes once the evening load adds a session", async () => {
    const f = vi.fn(async () => { throw new Error("no network in tests"); });
    vi.stubGlobal("fetch", f);
    const r = await priceStats(env, "BIG");
    expect(r).toMatchObject({ ok: true, as_of: "2026-11-09" });
    expect(f).not.toHaveBeenCalled();

    db.raw.prepare("INSERT INTO daily_prices (symbol, date, open, high, low, close, prev_close, volume, turnover) VALUES ('BIG', '2026-11-10', 10, 15, 9, 14, 13, 100, 1000)").run();
    // stored=1 answers the older row at once; without it the figures are worked out again from the history.
    expect(await priceStats(env, "BIG", { stored: true })).toMatchObject({ as_of: "2026-11-09" });
    expect(await priceStats(env, "BIG")).toMatchObject({ ok: true, as_of: "2026-11-10" });
    expect(await priceStats(env, "SMALL", { stored: true })).toMatchObject({ ok: true, as_of: "2026-11-09" });
    expect(await priceStats(env, "UNSEEN", { stored: true })).toMatchObject({ ok: false, status: 404 });
    expect(f).not.toHaveBeenCalled();
  });
});
