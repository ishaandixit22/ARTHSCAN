import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { migrate, SqliteDatabase } from "../src/db/sqlite.js";
import type { Env } from "../src/env.js";

const db = new SqliteDatabase(":memory:");
const env: Env = { DB: db, PUBLIC_SITE_ORIGIN: "https://arthscan.me", TOKEN_PEPPER: "p", INTERNAL_API_KEY: "i", FREE_DAILY_QUOTA: "50", INDIANAPI_KEY: "k" };
const call = async (path: string, e: Env = env) => {
  const res = await app.fetch(new Request(`https://x${path}`, { headers: { "x-internal-key": "i" } }), e);
  return { status: res.status, body: (await res.json()) as any };
};

beforeAll(() => {
  migrate(db);
  db.raw.exec(`INSERT INTO stocks (symbol, name) VALUES ('TATASTEEL', 'Tata Steel Limited');`);
});
afterEach(() => vi.unstubAllGlobals());

describe("Indian Stock API tools", () => {
  it("sends the key, maps an NSE symbol to the company name and caches the answer", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ companyName: "Tata Steel" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const first = await call("/v1/ext/stock?stock=tatasteel");
    expect(first.status).toBe(200);
    expect(first.body.data.data.companyName).toBe("Tata Steel");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://stock.indianapi.in/stock?name=Tata+Steel");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("k");

    await call("/v1/ext/stock?stock=TATASTEEL");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("answers 503 when no key is configured", async () => {
    const r = await call("/v1/ext/news", { ...env, INDIANAPI_KEY: undefined });
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe("E_UNAVAILABLE");
  });

  it("turns provider errors into tool errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    expect((await call("/v1/ext/ipo")).body.error.code).toBe("E_UPSTREAM_QUOTA");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("oops", { status: 500 })));
    expect((await call("/v1/ext/trending")).status).toBe(502);
  });
});

describe("Indian Stock API error bodies", () => {
  it("treats a 200 {error} body as not found, doesn't cache it, and retries funds without the plan suffix", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("Regular")
        ? new Response(JSON.stringify({ error: "An error occurred" }), { status: 200 })
        : new Response(JSON.stringify({ basic_info: { fund_name: "Some Focused Fund" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await call("/v1/ext/mutual-funds/details?name=Some%20Focused%20Fund%20Regular%20Growth");
    expect(r.status).toBe(200);
    expect(r.body.data.data.basic_info.fund_name).toBe("Some Focused Fund");
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      "https://stock.indianapi.in/mutual_funds_details?stock_name=Some+Focused+Fund+Regular+Growth",
      "https://stock.indianapi.in/mutual_funds_details?stock_name=Some+Focused+Fund",
    ]);
    const cached = await db.prepare("SELECT key FROM external_cache WHERE key LIKE '%Regular%'").all();
    expect(cached.results).toEqual([]);
  });
});
