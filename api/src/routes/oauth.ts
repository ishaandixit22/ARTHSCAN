// OAuth 2.1 authorization server for the MCP endpoint, following the MCP
// authorization spec: protected-resource metadata (RFC 9728) points clients
// here, they self-register (RFC 7591), send the user through /oauth/authorize
// with PKCE S256, and swap the code for a 1-hour access token plus a rotating
// 30-day refresh token. Sign-in itself is the site's normal Google (or dev)
// session; the website's /connect/<id> page shows the consent screen.
//
// `oauth` is mounted at the root (well-known + /oauth/*); `oauthAccount` at
// /api/oauth for the consent page and the "connected apps" list.

import { Hono, type Context } from "hono";
import type { Account, AppEnv, Env } from "../env.js";
import { b64url, hashToken, newId, randomString, secretEquals, sqlTime } from "../lib/crypto.js";
import { jsonError } from "../lib/http.js";
import { requireSession } from "../middleware/auth.js";

const SCOPE = "mcp";
const CODE_TTL_SEC = 600;
const REQUEST_TTL_SEC = 1800; // time to sign in and approve
const ACCESS_TTL_SEC = 3600;
const REFRESH_TTL_SEC = 30 * 24 * 3600;
const AUTH_METHODS = ["none", "client_secret_post", "client_secret_basic"];

const origin = (env: Env) => env.PUBLIC_SITE_ORIGIN.replace(/\/$/, "");
export const mcpResource = (env: Env) => `${origin(env)}/mcp`;
export const resourceMetadataUrl = (env: Env) => `${origin(env)}/.well-known/oauth-protected-resource/mcp`;
const inSeconds = (s: number) => sqlTime(new Date(Date.now() + s * 1000));

async function cleanup(env: Env) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM oauth_requests WHERE expires_at < datetime('now')"),
    env.DB.prepare("DELETE FROM oauth_codes WHERE expires_at < datetime('now', '-1 day')"),
  ]);
}

/** https anywhere, or http only on loopback (desktop clients); never fragments. */
function validRedirectUri(uri: unknown): uri is string {
  if (typeof uri !== "string") return false;
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

/** The resource indicator, if sent, must name this server's MCP endpoint (or the site). */
function validResource(env: Env, resource: string | undefined) {
  if (!resource) return true;
  const r = resource.replace(/\/$/, "");
  return r === mcpResource(env) || r === origin(env);
}

function oauthError(c: Context, status: number, error: string, description: string) {
  c.header("Cache-Control", "no-store");
  return c.json({ error, error_description: description }, status as 400);
}

function redirectWith(uri: string, params: Record<string, string | null | undefined>) {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
  return u.toString();
}

// ── Discovery ──────────────────────────────────────────────────────

export const oauth = new Hono<AppEnv>();

const protectedResource = (c: Context<AppEnv>) =>
  c.json({
    resource: mcpResource(c.env),
    authorization_servers: [origin(c.env)],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Arthlens MCP server",
  });
oauth.get("/.well-known/oauth-protected-resource", protectedResource);
oauth.get("/.well-known/oauth-protected-resource/mcp", protectedResource);

oauth.get("/.well-known/oauth-authorization-server", (c) => {
  const o = origin(c.env);
  return c.json({
    issuer: o,
    authorization_endpoint: `${o}/oauth/authorize`,
    token_endpoint: `${o}/oauth/token`,
    registration_endpoint: `${o}/oauth/register`,
    revocation_endpoint: `${o}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: AUTH_METHODS,
    revocation_endpoint_auth_methods_supported: AUTH_METHODS,
    scopes_supported: [SCOPE],
  });
});

// ── Dynamic client registration (RFC 7591) ─────────────────────────

oauth.post("/oauth/register", async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, any> | null;
  if (!body || typeof body !== "object") return oauthError(c, 400, "invalid_client_metadata", "Body must be a JSON object.");
  const uris = body.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > 10 || !uris.every(validRedirectUri)) {
    return oauthError(c, 400, "invalid_redirect_uri", "redirect_uris must be 1-10 https URLs (http only for localhost).");
  }
  const method = body.token_endpoint_auth_method ?? "client_secret_basic";
  if (!AUTH_METHODS.includes(method)) return oauthError(c, 400, "invalid_client_metadata", `token_endpoint_auth_method must be one of ${AUTH_METHODS.join(", ")}.`);
  const grants: string[] = body.grant_types ?? ["authorization_code", "refresh_token"];
  if (!Array.isArray(grants) || grants.some((g) => !["authorization_code", "refresh_token"].includes(g))) {
    return oauthError(c, 400, "invalid_client_metadata", "Only authorization_code and refresh_token grants are supported.");
  }
  const name = String(body.client_name ?? "").trim().slice(0, 80) || new URL(uris[0]).hostname;

  const clientId = `cli_${randomString(24)}`;
  const secret = method === "none" ? null : `cs_${randomString(40)}`;
  await c.env.DB.prepare(`INSERT INTO oauth_clients (client_id, client_secret_hash, client_name, redirect_uris, token_endpoint_auth_method)
    VALUES (?, ?, ?, ?, ?)`).bind(clientId, secret ? await hashToken(secret, c.env.TOKEN_PEPPER) : null, name, JSON.stringify(uris), method).run();

  c.header("Cache-Control", "no-store");
  return c.json({
    client_id: clientId,
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: name,
    redirect_uris: uris,
    token_endpoint_auth_method: method,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: SCOPE,
  }, 201);
});

type Client = { client_id: string; client_secret_hash: string | null; client_name: string; redirect_uris: string; token_endpoint_auth_method: string };

const getClient = (env: Env, id: string | undefined) =>
  id ? env.DB.prepare("SELECT * FROM oauth_clients WHERE client_id = ?").bind(id).first<Client>() : Promise.resolve(null);

// ── Authorization endpoint ─────────────────────────────────────────

oauth.get("/oauth/authorize", async (c) => {
  const q = c.req.query();
  const client = await getClient(c.env, q.client_id);
  // Until client and redirect_uri check out, errors are shown here rather than
  // sent to an unverified redirect (that would be an open redirector).
  if (!client) return c.text("Unknown client_id. The app needs to register again.", 400);
  const uris = JSON.parse(client.redirect_uris) as string[];
  const redirectUri = q.redirect_uri ?? (uris.length === 1 ? uris[0] : undefined);
  if (!redirectUri || !uris.includes(redirectUri)) return c.text("redirect_uri does not match the registered value.", 400);

  const fail = (error: string, description: string) =>
    c.redirect(redirectWith(redirectUri, { error, error_description: description, state: q.state }));
  if (q.response_type !== "code") return fail("unsupported_response_type", "response_type must be code.");
  if (!q.code_challenge || q.code_challenge_method !== "S256") return fail("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  if (!validResource(c.env, q.resource)) return fail("invalid_target", "Unknown resource.");
  const scopes = (q.scope ?? SCOPE).split(" ").filter(Boolean);
  if (scopes.some((s) => s !== SCOPE)) return fail("invalid_scope", `Only the '${SCOPE}' scope is offered.`);

  await cleanup(c.env);
  const id = `req_${randomString(24)}`;
  await c.env.DB.prepare(`INSERT INTO oauth_requests (id, client_id, redirect_uri, state, code_challenge, scope, resource, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, client.client_id, redirectUri, q.state ?? null, q.code_challenge, SCOPE, q.resource ?? null, inSeconds(REQUEST_TTL_SEC)).run();
  // The website shows sign-in (if needed) and the consent screen.
  return c.redirect(`${origin(c.env)}/connect/${id}`);
});

// ── Token endpoint ─────────────────────────────────────────────────

async function readParams(c: Context): Promise<Record<string, string>> {
  const type = c.req.header("content-type") ?? "";
  if (type.includes("application/json")) return ((await c.req.json().catch(() => ({}))) as Record<string, string>) ?? {};
  const form = await c.req.parseBody().catch(() => ({}));
  return Object.fromEntries(Object.entries(form).map(([k, v]) => [k, String(v)]));
}

/** Identifies the calling client per its registered auth method. */
async function authenticateClient(c: Context<AppEnv>, p: Record<string, string>): Promise<Client | null> {
  let id = p.client_id;
  let secret = p.client_secret;
  const basic = c.req.header("authorization");
  if (basic?.toLowerCase().startsWith("basic ")) {
    try {
      const [u, s] = atob(basic.slice(6).trim()).split(":");
      id = decodeURIComponent(u);
      secret = decodeURIComponent(s ?? "");
    } catch {
      return null;
    }
  }
  const client = await getClient(c.env, id);
  if (!client) return null;
  if (client.token_endpoint_auth_method === "none") return client;
  if (!secret || !client.client_secret_hash) return null;
  return (await secretEquals(await hashToken(secret, c.env.TOKEN_PEPPER), client.client_secret_hash)) ? client : null;
}

async function issueTokens(env: Env, grantId: string | null, client: Client, accountId: string, scope: string, resource: string | null) {
  const access = `alo_${randomString(40)}`;
  const refresh = `alr_${randomString(48)}`;
  const [ah, rh] = await Promise.all([hashToken(access, env.TOKEN_PEPPER), hashToken(refresh, env.TOKEN_PEPPER)]);
  if (grantId) {
    await env.DB.prepare(`UPDATE oauth_tokens SET access_hash = ?, access_expires_at = ?, refresh_hash = ?, refresh_expires_at = ? WHERE id = ?`)
      .bind(ah, inSeconds(ACCESS_TTL_SEC), rh, inSeconds(REFRESH_TTL_SEC), grantId).run();
  } else {
    await env.DB.prepare(`INSERT INTO oauth_tokens (id, client_id, account_id, access_hash, access_expires_at, refresh_hash, refresh_expires_at, scope, resource)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(newId("grant_"), client.client_id, accountId, ah, inSeconds(ACCESS_TTL_SEC), rh, inSeconds(REFRESH_TTL_SEC), scope, resource).run();
  }
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_SEC, refresh_token: refresh, scope };
}

oauth.post("/oauth/token", async (c) => {
  const p = await readParams(c);
  const client = await authenticateClient(c, p);
  if (!client) {
    c.header("WWW-Authenticate", 'Basic realm="oauth"');
    return oauthError(c, 401, "invalid_client", "Client authentication failed.");
  }
  c.header("Cache-Control", "no-store");

  if (p.grant_type === "authorization_code") {
    if (!p.code || !p.code_verifier) return oauthError(c, 400, "invalid_request", "code and code_verifier are required.");
    const codeHash = await hashToken(p.code, c.env.TOKEN_PEPPER);
    // Claim the code atomically so a replay can't mint a second token.
    const claimed = await c.env.DB.prepare(`UPDATE oauth_codes SET used_at = datetime('now')
      WHERE code_hash = ? AND used_at IS NULL AND expires_at > datetime('now')`).bind(codeHash).run();
    const code = await c.env.DB.prepare("SELECT * FROM oauth_codes WHERE code_hash = ?").bind(codeHash)
      .first<{ client_id: string; account_id: string; redirect_uri: string; code_challenge: string; scope: string; resource: string | null }>();
    if (!claimed.meta.changes || !code) return oauthError(c, 400, "invalid_grant", "The code is invalid, expired or already used.");
    if (code.client_id !== client.client_id) return oauthError(c, 400, "invalid_grant", "The code was issued to another client.");
    if (p.redirect_uri && p.redirect_uri !== code.redirect_uri) return oauthError(c, 400, "invalid_grant", "redirect_uri does not match.");
    const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(p.code_verifier)));
    if (challenge !== code.code_challenge) return oauthError(c, 400, "invalid_grant", "PKCE verification failed.");
    if (p.resource && !validResource(c.env, p.resource)) return oauthError(c, 400, "invalid_target", "Unknown resource.");
    return c.json(await issueTokens(c.env, null, client, code.account_id, code.scope, code.resource ?? p.resource ?? null));
  }

  if (p.grant_type === "refresh_token") {
    if (!p.refresh_token) return oauthError(c, 400, "invalid_request", "refresh_token is required.");
    const grant = await c.env.DB.prepare(`SELECT id, client_id, account_id, scope, resource FROM oauth_tokens
      WHERE refresh_hash = ? AND revoked_at IS NULL AND refresh_expires_at > datetime('now')`)
      .bind(await hashToken(p.refresh_token, c.env.TOKEN_PEPPER))
      .first<{ id: string; client_id: string; account_id: string; scope: string; resource: string | null }>();
    if (!grant || grant.client_id !== client.client_id) return oauthError(c, 400, "invalid_grant", "The refresh token is invalid or expired.");
    // Rotation: the old refresh token stops working as soon as this succeeds.
    return c.json(await issueTokens(c.env, grant.id, client, grant.account_id, grant.scope, grant.resource));
  }

  return oauthError(c, 400, "unsupported_grant_type", "grant_type must be authorization_code or refresh_token.");
});

// RFC 7009: always 200, whether or not the token existed.
oauth.post("/oauth/revoke", async (c) => {
  const p = await readParams(c);
  const client = await authenticateClient(c, p);
  if (!client) return oauthError(c, 401, "invalid_client", "Client authentication failed.");
  if (p.token) {
    const h = await hashToken(p.token, c.env.TOKEN_PEPPER);
    await c.env.DB.prepare(`UPDATE oauth_tokens SET revoked_at = datetime('now')
      WHERE client_id = ? AND (access_hash = ? OR refresh_hash = ?) AND revoked_at IS NULL`).bind(client.client_id, h, h).run();
  }
  return c.body(null, 200);
});

// ── Consent + connected apps (website, session-only) ───────────────

export const oauthAccount = new Hono<AppEnv>();
oauthAccount.use("*", requireSession());

type PendingRequest = { id: string; client_id: string; redirect_uri: string; state: string | null; code_challenge: string; scope: string; resource: string | null; client_name: string };

const getRequest = (env: Env, id: string) =>
  env.DB.prepare(`SELECT r.*, c.client_name FROM oauth_requests r JOIN oauth_clients c ON c.client_id = r.client_id
    WHERE r.id = ? AND r.expires_at > datetime('now')`).bind(id).first<PendingRequest>();

oauthAccount.get("/requests/:id", async (c) => {
  const r = await getRequest(c.env, c.req.param("id"));
  if (!r) return jsonError(c, 404, "E_EXPIRED", "This connection request has expired. Start again from the app.");
  return c.json({ ok: true, request: { id: r.id, client_name: r.client_name, redirect_host: new URL(r.redirect_uri).host, scope: r.scope } });
});

oauthAccount.post("/requests/:id/decision", async (c) => {
  const account = (c.get("principal") as { account: Account }).account;
  const r = await getRequest(c.env, c.req.param("id"));
  if (!r) return jsonError(c, 404, "E_EXPIRED", "This connection request has expired. Start again from the app.");
  const body = (await c.req.json().catch(() => ({}))) as { approve?: boolean };
  await c.env.DB.prepare("DELETE FROM oauth_requests WHERE id = ?").bind(r.id).run();

  if (body.approve !== true) {
    return c.json({ ok: true, redirect: redirectWith(r.redirect_uri, { error: "access_denied", error_description: "The user declined.", state: r.state }) });
  }
  const code = `alc_${randomString(40)}`;
  await c.env.DB.prepare(`INSERT INTO oauth_codes (code_hash, client_id, account_id, redirect_uri, code_challenge, scope, resource, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(await hashToken(code, c.env.TOKEN_PEPPER), r.client_id, account.id, r.redirect_uri, r.code_challenge, r.scope, r.resource, inSeconds(CODE_TTL_SEC)).run();
  return c.json({ ok: true, redirect: redirectWith(r.redirect_uri, { code, state: r.state, iss: origin(c.env) }) });
});

oauthAccount.get("/grants", async (c) => {
  const account = (c.get("principal") as { account: Account }).account;
  const { results } = await c.env.DB.prepare(`
    SELECT c.client_id, c.client_name, MIN(g.created_at) AS connected_at, MAX(g.last_used_at) AS last_used_at
    FROM oauth_tokens g JOIN oauth_clients c ON c.client_id = g.client_id
    WHERE g.account_id = ? AND g.revoked_at IS NULL AND g.refresh_expires_at > datetime('now')
    GROUP BY c.client_id ORDER BY connected_at DESC`).bind(account.id).all();
  return c.json({ ok: true, grants: results });
});

oauthAccount.delete("/grants/:clientId", async (c) => {
  const account = (c.get("principal") as { account: Account }).account;
  const r = await c.env.DB.prepare("UPDATE oauth_tokens SET revoked_at = datetime('now') WHERE account_id = ? AND client_id = ? AND revoked_at IS NULL")
    .bind(account.id, c.req.param("clientId")).run();
  if (!r.meta.changes) return jsonError(c, 404, "E_NOT_FOUND", "No active connection for that app.");
  return c.json({ ok: true });
});
