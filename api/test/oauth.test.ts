import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { migrate, SqliteDatabase } from "../src/db/sqlite.js";
import type { Env } from "../src/env.js";
import { b64url } from "../src/lib/crypto.js";

const db = new SqliteDatabase(":memory:");
const ORIGIN = "http://localhost:5173";
const env: Env = { DB: db, PUBLIC_SITE_ORIGIN: ORIGIN, TOKEN_PEPPER: "t", INTERNAL_API_KEY: "i", FREE_DAILY_QUOTA: "50", AUTH_DEV_LOGIN: "true" };
const req = (path: string, init: RequestInit = {}) => app.fetch(new Request(`http://x${path}`, init), env);
const json = (body: unknown, headers: Record<string, string> = {}) => ({ method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const form = (body: Record<string, string>, headers: Record<string, string> = {}) => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams(body).toString() });
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

let cookie = "";
const verifier = "v".repeat(20) + "-verifier-for-pkce-test-0123456789";
let challenge = "";

/** Runs register → authorize → consent, returns { client, code }. */
async function authorize(auth = "none", approve = true) {
  const reg = (await (await req("/oauth/register", json({ client_name: "Claude", redirect_uris: [REDIRECT], token_endpoint_auth_method: auth }))).json()) as any;
  const url = `/oauth/authorize?${new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256", state: "xyz", scope: "mcp", resource: `${ORIGIN}/mcp` })}`;
  const a = await req(url);
  expect(a.status).toBe(302);
  const consent = new URL(a.headers.get("location")!);
  expect(consent.pathname).toMatch(/^\/connect\/req_/);
  const id = consent.pathname.split("/").pop();
  const info = (await (await req(`/api/oauth/requests/${id}`, { headers: { cookie } })).json()) as any;
  expect(info.request.client_name).toBe("Claude");
  const d = (await (await req(`/api/oauth/requests/${id}/decision`, json({ approve }, { cookie }))).json()) as any;
  const back = new URL(d.redirect);
  expect(back.searchParams.get("state")).toBe("xyz");
  return { client: reg, code: back.searchParams.get("code"), error: back.searchParams.get("error") };
}

beforeAll(async () => {
  migrate(db);
  db.raw.exec(`INSERT INTO stocks (symbol, name) VALUES ('TCS', 'Tata Consultancy Services');
    INSERT INTO daily_prices (symbol, date, close, prev_close) VALUES ('TCS', '2026-10-28', 2970, 3000);`);
  const login = await req("/api/auth/dev", json({ email: "oauth@example.com" }));
  cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
});

describe("OAuth for MCP", () => {
  it("publishes discovery metadata", async () => {
    const pr = (await (await req("/.well-known/oauth-protected-resource/mcp")).json()) as any;
    expect(pr.resource).toBe(`${ORIGIN}/mcp`);
    expect(pr.authorization_servers).toEqual([ORIGIN]);
    const as = (await (await req("/.well-known/oauth-authorization-server")).json()) as any;
    expect(as.token_endpoint).toBe(`${ORIGIN}/oauth/token`);
    expect(as.code_challenge_methods_supported).toEqual(["S256"]);
  });

  it("rejects bad registrations and authorize requests", async () => {
    expect((await req("/oauth/register", json({ redirect_uris: ["http://evil.example/cb"] }))).status).toBe(400);
    const reg = (await (await req("/oauth/register", json({ redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" }))).json()) as any;
    // Unregistered redirect: shown as an error page, never redirected.
    const r = await req(`/oauth/authorize?response_type=code&client_id=${reg.client_id}&redirect_uri=https://evil.example/cb&code_challenge=x&code_challenge_method=S256`);
    expect(r.status).toBe(400);
    // Missing PKCE: error goes back to the client's registered redirect.
    const p = await req(`/oauth/authorize?response_type=code&client_id=${reg.client_id}&redirect_uri=${encodeURIComponent(REDIRECT)}`);
    expect(new URL(p.headers.get("location")!).searchParams.get("error")).toBe("invalid_request");
  });

  it("burns a code on a wrong PKCE verifier", async () => {
    const { client, code } = await authorize();
    const bad = await req("/oauth/token", form({ grant_type: "authorization_code", code: code!, code_verifier: "wrong", client_id: client.client_id, redirect_uri: REDIRECT }));
    expect(bad.status).toBe(400);
    const retry = await req("/oauth/token", form({ grant_type: "authorization_code", code: code!, code_verifier: verifier, client_id: client.client_id, redirect_uri: REDIRECT }));
    expect(retry.status).toBe(400);
  });
});

describe("OAuth token lifecycle", () => {
  it("exchanges, uses, refreshes, rejects replay, and revokes", async () => {
    const { client, code } = await authorize();
    const ex = await req("/oauth/token", form({ grant_type: "authorization_code", code: code!, code_verifier: verifier, client_id: client.client_id, redirect_uri: REDIRECT, resource: `${ORIGIN}/mcp` }));
    expect(ex.status).toBe(200);
    const t1 = (await ex.json()) as any;
    expect(t1.token_type).toBe("Bearer");

    // Replaying the code fails.
    const replay = await req("/oauth/token", form({ grant_type: "authorization_code", code: code!, code_verifier: verifier, client_id: client.client_id }));
    expect(replay.status).toBe(400);

    const call = (t: string) => req("/mcp", json({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_quote", arguments: { symbol: "TCS" } } }, { authorization: `Bearer ${t}` }));
    const ok = (await (await call(t1.access_token)).json()) as any;
    expect(ok.result.structuredContent.close).toBe(2970);

    // Refresh rotates: new tokens work, the old refresh token doesn't.
    const t2 = (await (await req("/oauth/token", form({ grant_type: "refresh_token", refresh_token: t1.refresh_token, client_id: client.client_id }))).json()) as any;
    expect(t2.access_token).not.toBe(t1.access_token);
    expect((await req("/oauth/token", form({ grant_type: "refresh_token", refresh_token: t1.refresh_token, client_id: client.client_id }))).status).toBe(400);
    expect((await call(t1.access_token)).status).toBe(401);
    expect((await call(t2.access_token)).status).toBe(200);

    // Shows under connected apps; disconnecting kills the token.
    const grants = (await (await req("/api/oauth/grants", { headers: { cookie } })).json()) as any;
    expect(grants.grants.map((g: any) => g.client_name)).toContain("Claude");
    await req(`/api/oauth/grants/${client.client_id}`, { method: "DELETE", headers: { cookie } });
    expect((await call(t2.access_token)).status).toBe(401);
  });

  it("authenticates confidential clients with client_secret_basic", async () => {
    const { client, code } = await authorize("client_secret_basic");
    const params = { grant_type: "authorization_code", code: code!, code_verifier: verifier, redirect_uri: REDIRECT };
    expect((await req("/oauth/token", form(params, { authorization: `Basic ${btoa(`${client.client_id}:wrong`)}` }))).status).toBe(401);
    const ok = await req("/oauth/token", form(params, { authorization: `Basic ${btoa(`${client.client_id}:${client.client_secret}`)}` }));
    expect(ok.status).toBe(200);
  });

  it("sends access_denied when the user declines", async () => {
    const { code, error } = await authorize("none", false);
    expect(code).toBeNull();
    expect(error).toBe("access_denied");
  });
});
