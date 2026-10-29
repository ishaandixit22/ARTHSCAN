import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { migrate, SqliteDatabase } from "../src/db/sqlite.js";
import type { Env } from "../src/env.js";

const db = new SqliteDatabase(":memory:");
const env: Env = { DB: db, PUBLIC_SITE_ORIGIN: "https://arthscan.me", TOKEN_PEPPER: "p", INTERNAL_API_KEY: "i", FREE_DAILY_QUOTA: "50" };

// A minimal stand-in for Cloudflare's per-location cache.
const store = new Map<string, Response>();
const fakeCaches = { default: { match: async (r: Request) => store.get(r.url)?.clone(), put: async (r: Request, res: Response) => void store.set(r.url, res) } };
const ctx = { waitUntil: (p: Promise<unknown>) => void p };
const call = (path: string, headers: Record<string, string> = { "x-internal-key": "i" }) =>
  app.fetch(new Request(`https://x${path}`, { headers }), env, ctx as never);

beforeAll(() => {
  migrate(db);
  db.raw.exec("INSERT INTO stocks (symbol, name) VALUES ('AAA', 'Aaa Ltd')");
});
afterEach(() => { store.clear(); vi.unstubAllGlobals(); });

describe("edge cache for the website's API calls", () => {
  it("serves a repeat GET from the cache, and leaves API users alone", async () => {
    vi.stubGlobal("caches", fakeCaches);
    const first = await call("/v1/stocks/AAA");
    expect(first.status).toBe(200);
    expect(first.headers.get("x-edge-cache")).toBe("miss");
    db.raw.exec("UPDATE stocks SET name = 'Changed' WHERE symbol = 'AAA'");
    const again = await call("/v1/stocks/AAA");
    expect(again.headers.get("x-edge-cache")).toBe("hit");
    expect(((await again.json()) as any).data.name).toBe("Aaa Ltd"); // the stored answer

    // A request with a visitor's cookie or no internal key is never cached or served from the cache.
    const cookie = await call("/v1/stocks/AAA", { "x-internal-key": "i", cookie: "al_session=x" });
    expect(cookie.headers.get("x-edge-cache")).toBeNull();
    const anon = await call("/v1/stocks/AAA", {});
    expect(anon.status).toBe(401);
    expect(store.size).toBe(1);
  });

  it("never caches errors", async () => {
    vi.stubGlobal("caches", fakeCaches);
    const r = await call("/v1/stocks/NOPE");
    expect(r.status).toBe(404);
    expect(store.size).toBe(0);
  });
});
