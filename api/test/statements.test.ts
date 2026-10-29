import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { migrate, SqliteDatabase } from "../src/db/sqlite.js";
import type { Env } from "../src/env.js";
import { fillStatements, statementsFor } from "../src/lib/statements.js";

const db = new SqliteDatabase(":memory:");
const env: Env = { DB: db, PUBLIC_SITE_ORIGIN: "https://arthscan.me", TOKEN_PEPPER: "p", INTERNAL_API_KEY: "i", FREE_DAILY_QUOTA: "50", INDIANAPI_KEY: "k" };
const call = async (path: string) => {
  const res = await app.fetch(new Request(`https://x${path}`, { headers: { "x-internal-key": "i" } }), env);
  return { status: res.status, body: (await res.json()) as any };
};
const BUNDLE = { quarter_results: { Sales: { "Sep 2026": 322 } }, balancesheet: { "Total Assets": { "Mar 2026": 5000 } }, ratios: { "ROCE %": { "Mar 2026": 31 } } };

beforeAll(() => {
  migrate(db);
  db.raw.exec(`INSERT INTO stocks (symbol, name) VALUES ('CDSL', 'Central Depository Services (India) Limited'), ('NOPE', 'Unknown Company Limited'), ('BIG', 'Big Co Limited'), ('IDLE', 'Idle Co Limited');
    INSERT INTO daily_prices (symbol, date, close, prev_close, volume, turnover) VALUES
      ('CDSL', '2026-10-29', 100, 99, 1, 500), ('NOPE', '2026-10-29', 10, 10, 1, 300), ('BIG', '2026-10-29', 50, 50, 1, 900);`);
});
afterEach(() => vi.unstubAllGlobals());

const provider = (known: string[]) => vi.fn(async (url: string) => {
  const name = new URL(url).searchParams.get("stock_name") ?? "";
  return new Response(JSON.stringify(known.includes(name) ? BUNDLE : { error: "Unknown stock" }));
});

describe("statement store", () => {
  it("fills the largest companies first, one request each, and remembers who the provider doesn't know", async () => {
    const f = provider(["CDSL", "BIG"]);
    vi.stubGlobal("fetch", f);
    const r = await fillStatements(env, { maxRequests: 10, dailyCap: 100 });
    // BIG (₹900) before NOPE (₹300) before CDSL (₹500)? No: ordered by turnover, so BIG, CDSL, NOPE. IDLE never traded, so it isn't asked.
    expect(r).toMatchObject({ asked: 3, stored: 2, unknown: 1, skipped: null });
    expect(f.mock.calls.map((c) => new URL(c[0] as string).searchParams.get("stock_name")).slice(0, 2)).toEqual(["BIG", "CDSL"]);
    expect(db.raw.prepare("SELECT symbol, found FROM company_statements ORDER BY symbol").all()).toEqual([{ symbol: "BIG", found: 1 }, { symbol: "CDSL", found: 1 }, { symbol: "NOPE", found: 0 }]);
    // A second batch has nothing left to ask.
    expect((await fillStatements(env, { maxRequests: 10, dailyCap: 100 })).asked).toBe(0);
  });

  it("serves a stored company without calling the provider, slices by statement, and answers 404 for the unknown one", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const r = await call("/v1/ext/statements?stock=CDSL&stats=balancesheet");
    expect(r.status).toBe(200);
    expect(r.body.data.data).toEqual(BUNDLE.balancesheet);
    expect((await call("/v1/ext/statements?stock=cdsl&stats=all")).body.data.data.ratios).toEqual(BUNDLE.ratios);
    expect((await call("/v1/ext/statements?stock=CDSL&stats=cashflow")).status).toBe(404); // the provider had none for this company
    expect((await call("/v1/ext/statements?stock=NOPE&stats=ratios")).status).toBe(404);
    // The website asks with listed_only, so free text is refused before any provider request.
    expect((await call("/v1/ext/statements?stock=Some+Made+Up+Name&stats=ratios&listed_only=true")).status).toBe(404);
    expect((await call("/v1/ext/statements?stock=CDSL&stats=ratios&listed_only=true")).status).toBe(200);
    expect(f).not.toHaveBeenCalled();
  });

  it("fetches a company that isn't stored yet once, writes it back, and serves an older copy if the provider later refuses", async () => {
    const f = provider(["IDLE"]);
    vi.stubGlobal("fetch", f);
    expect(await statementsFor(env, "IDLE")).toMatchObject({ stored: false });
    expect(await statementsFor(env, "IDLE")).toMatchObject({ stored: true });
    expect(f).toHaveBeenCalledTimes(1);
    db.raw.exec("UPDATE company_statements SET fetched_at = fetched_at - 99 * 86400 WHERE symbol = 'IDLE'"); // older than the freshness window
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    expect(await statementsFor(env, "IDLE")).toMatchObject({ stored: true, bundle: BUNDLE });
    expect(await statementsFor(env, "NOTASTOCK")).toBeUndefined();
  });

  it("stops at the daily cap", async () => {
    db.raw.exec("DELETE FROM company_statements; DELETE FROM external_cache WHERE key LIKE 'statements:count:%'");
    vi.stubGlobal("fetch", provider(["CDSL", "BIG"]));
    expect((await fillStatements(env, { maxRequests: 10, dailyCap: 2 })).asked).toBe(2);
    expect(await fillStatements(env, { maxRequests: 10, dailyCap: 2 })).toMatchObject({ asked: 0, skipped: expect.stringContaining("Daily cap") });
  });
});
