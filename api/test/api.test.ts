import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { migrate, SqliteDatabase } from "../src/db/sqlite.js";
import type { Env } from "../src/env.js";

const db = new SqliteDatabase(":memory:");
const env: Env = {
  DB: db, PUBLIC_SITE_ORIGIN: "http://localhost:5173", TOKEN_PEPPER: "test",
  INTERNAL_API_KEY: "internal-test", FREE_DAILY_QUOTA: "3", AUTH_DEV_LOGIN: "true",
};
const req = (path: string, init: RequestInit = {}) => app.fetch(new Request(`http://x${path}`, init), env);
const rpc = (method: string, params: unknown, headers: Record<string, string> = {}) =>
  req("/mcp", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });

let token = "";
let cookie = "";

beforeAll(async () => {
  migrate(db);
  db.raw.exec(`
    INSERT INTO stocks (symbol, name, sector, series) VALUES ('RELIANCE', 'Reliance Industries Limited', 'Oil Gas & Consumable Fuels', 'EQ'),
      ('TCS', 'Tata Consultancy Services Limited', 'Information Technology', 'EQ');
    INSERT INTO daily_prices (symbol, date, open, high, low, close, prev_close, volume, turnover) VALUES
      ('RELIANCE', '2026-10-27', 1400, 1420, 1390, 1410, 1400, 1000000, 1.41e9),
      ('RELIANCE', '2026-10-28', 1410, 1450, 1405, 1440, 1410, 2000000, 2.88e9),
      ('TCS', '2026-10-28', 3000, 3010, 2950, 2970, 3000, 500000, 1.49e9);
    INSERT INTO price_adjustments VALUES ('RELIANCE', '2026-10-28', 0.5, 'manual', 'test 1:1 bonus');
    UPDATE daily_prices SET adj = 0.5 WHERE symbol = 'RELIANCE' AND date < '2026-10-28';
    INSERT INTO stock_metrics (symbol, as_of, close, change_pct, turnover, ret_1y) VALUES
      ('RELIANCE', '2026-10-28', 1440, 2.13, 2.88e9, 25), ('TCS', '2026-10-28', 2970, -1, 1.49e9, -5);
    INSERT INTO fii_dii VALUES ('2026-10-28', 'FII', 16834.53, 15962.7, 871.83), ('2026-10-28', 'DII', 17240.9, 16597.55, 643.35);
  `);
  const login = await req("/api/auth/dev", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "tester@example.com" }) });
  cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  const t = await req("/api/tokens", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ name: "test" }) });
  token = ((await t.json()) as any).token.secret;
});

describe("MCP", () => {
  it("lists tools without a token but requires auth for everything else", async () => {
    const list = (await (await rpc("tools/list", {})).json()) as any;
    expect(list.result.tools.map((t: any) => t.name)).toContain("screen_stocks");
    const init = await rpc("initialize", { protocolVersion: "2025-06-18" });
    expect(init.status).toBe(401);
    expect(init.headers.get("www-authenticate")).toContain('resource_metadata="http://localhost:5173/.well-known/oauth-protected-resource/mcp"');
    const bad = await rpc("tools/call", { name: "get_quote", arguments: { symbol: "TCS" } }, { authorization: "Bearer nope" });
    expect(bad.status).toBe(401);
    expect(bad.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });

  it("initializes with a token", async () => {
    const init = (await (await rpc("initialize", { protocolVersion: "2025-06-18" }, { authorization: `Bearer ${token}` })).json()) as any;
    expect(init.result.serverInfo.name).toBe("arthlens");
  });

  it("answers with a token", async () => {
    const r = (await (await rpc("tools/call", { name: "get_quote", arguments: { symbol: "reliance" } }, { authorization: `Bearer ${token}` })).json()) as any;
    expect(r.result.structuredContent.close).toBe(1440);
    // Prior close 1410 on a 1:1 bonus basis is 705, so +104% — the raw jump, handled via adj.
    expect(r.result.structuredContent.prev_close).toBe(705);
  });

  it("returns 202 for notifications", async () => {
    const r = await req("/mcp", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
    expect(r.status).toBe(202);
  });
});

describe("REST and quota", () => {
  it("returns split-adjusted history", async () => {
    const r = (await (await req("/v1/stocks/RELIANCE/history?period=1m", { headers: { "x-internal-key": "internal-test" } })).json()) as any;
    expect(r.data.candles.map((c: any) => c.close)).toEqual([705, 1440]);
    expect(r.data.adjustments[0].factor).toBe(0.5);
  });

  it("screens with filters via POST body", async () => {
    const r = (await (await req("/v1/screener", {
      method: "POST", headers: { "content-type": "application/json", "x-internal-key": "internal-test" },
      body: JSON.stringify({ filters: [{ field: "ret_1y", op: "gt", value: 0 }] }),
    })).json()) as any;
    expect(r.data.results.map((s: any) => s.symbol)).toEqual(["RELIANCE"]);
  });

  it("rejects unknown screener fields", async () => {
    const r = await req("/v1/screener?filters=" + encodeURIComponent('[{"field":"close; DROP TABLE stocks","op":"gt","value":1}]'), { headers: { "x-internal-key": "internal-test" } });
    expect(r.status).toBe(400);
  });

  it("enforces the daily quota for tokens but not the internal key", async () => {
    // One call already used by the MCP test above; limit is 3.
    const h = { authorization: `Bearer ${token}` };
    expect((await req("/v1/quote/TCS", { headers: h })).status).toBe(200);
    const last = await req("/v1/quote/TCS", { headers: h });
    expect(last.headers.get("x-ratelimit-remaining")).toBe("0");
    expect((await req("/v1/quote/TCS", { headers: h })).status).toBe(429);
    expect((await req("/v1/quote/TCS", { headers: { "x-internal-key": "internal-test" } })).status).toBe(200);
  });

  it("revoked tokens stop working", async () => {
    const list = (await (await req("/api/tokens", { headers: { cookie } })).json()) as any;
    await req(`/api/tokens/${list.tokens[0].id}`, { method: "DELETE", headers: { cookie } });
    expect((await req("/v1/quote/TCS", { headers: { authorization: `Bearer ${token}` } })).status).toBe(401);
  });

  it("serves FII/DII", async () => {
    const r = (await (await req("/v1/market/fii-dii", { headers: { "x-internal-key": "internal-test" } })).json()) as any;
    expect(r.data.daily[0].fii_net).toBeCloseTo(871.83);
  });
});
