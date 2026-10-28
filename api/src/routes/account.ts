// Sign-in, sessions, API tokens and usage — the account side of the site.
//
// Google sign-in (Authorization Code + PKCE, id_token verified against
// Google's JWKS) is adapted from agentdraft's worker/src/routes/google.ts. It
// stays dormant until GOOGLE_OAUTH_ENABLED and both client credentials are set.
// AUTH_DEV_LOGIN gives a local sign-in so the whole flow is testable without
// a Google project. It trusts whatever email is typed, so anywhere reachable
// from outside (a test tunnel) it must be gated by AUTH_DEV_LOGIN_CODE, and in
// production it must be off.

import { Hono } from "hono";
import type { Account, AppEnv, Env } from "../env.js";
import { dailyLimit, usageToday } from "../handlers/call.js";
import { b64url, b64urlDecode, hashToken, newApiToken, newId, randomString, secretEquals } from "../lib/crypto.js";
import { sessionCookie } from "../lib/cookie.js";
import { jsonError } from "../lib/http.js";
import { requireSession } from "../middleware/auth.js";
import { inviteOnly, isInvited } from "../lib/access.js";

const SESSION_TTL_SEC = 30 * 24 * 3600;
const MAX_TOKENS = 10;

export const account = new Hono<AppEnv>();

const googleEnabled = (env: Env) => env.GOOGLE_OAUTH_ENABLED === "true" && !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET;
const devEnabled = (env: Env) => env.AUTH_DEV_LOGIN === "true";
const isSecure = (env: Env) => env.PUBLIC_SITE_ORIGIN.startsWith("https://");
/** Only same-site relative paths, so return_to cannot become an open redirect. */
const safeReturn = (v: string | undefined) => (v && v.startsWith("/") && !v.startsWith("//") ? v : "/settings/tokens");

async function startSession(env: Env, accountId: string, method: "google" | "dev"): Promise<string> {
  const sid = `sess_${randomString(32)}`;
  const expires = new Date(Date.now() + SESSION_TTL_SEC * 1000).toISOString().replace("T", " ").slice(0, 19);
  await env.DB.prepare("INSERT INTO sessions (id, account_id, auth_method, expires_at) VALUES (?, ?, ?, ?)").bind(sid, accountId, method, expires).run();
  return sessionCookie(sid, SESSION_TTL_SEC, isSecure(env));
}

account.get("/auth/config", (c) =>
  c.json({
    ok: true, google: googleEnabled(c.env), dev_login: devEnabled(c.env), dev_login_code: !!c.env.AUTH_DEV_LOGIN_CODE,
    invite_only: inviteOnly(c.env),
  }),
);

// ── Dev sign-in ────────────────────────────────────────────────────

account.post("/auth/dev", async (c) => {
  if (!devEnabled(c.env)) return jsonError(c, 404, "E_NOT_FOUND", "No such route.");
  const body = (await c.req.json().catch(() => ({}))) as { name?: string; email?: string; code?: string };
  if (c.env.AUTH_DEV_LOGIN_CODE && !(await secretEquals(String(body.code ?? ""), c.env.AUTH_DEV_LOGIN_CODE))) {
    return jsonError(c, 403, "E_BAD_CODE", "Wrong access code.");
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return jsonError(c, 400, "E_BAD_EMAIL", "Enter a valid email.");
  if (!(await isInvited(c.env, email))) return jsonError(c, 403, "E_NOT_INVITED", "This email is not on the invite list.");
  const sub = `dev:${email}`;
  let acct = await c.env.DB.prepare("SELECT id FROM accounts WHERE google_sub = ?").bind(sub).first<{ id: string }>();
  if (!acct) {
    acct = { id: newId("acct_") };
    await c.env.DB.prepare("INSERT INTO accounts (id, name, email, google_sub) VALUES (?, ?, ?, ?)")
      .bind(acct.id, String(body.name ?? "").trim() || email.split("@")[0], email, sub).run();
  }
  c.header("Set-Cookie", await startSession(c.env, acct.id, "dev"));
  return c.json({ ok: true });
});

// ── Google sign-in ─────────────────────────────────────────────────

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const redirectUri = (env: Env) => `${env.PUBLIC_SITE_ORIGIN.replace(/\/$/, "")}/api/auth/google/callback`;

account.get("/auth/google/start", async (c) => {
  if (!googleEnabled(c.env)) return jsonError(c, 503, "E_OAUTH_NOT_CONFIGURED", "Google sign-in is not configured.");
  const state = randomString(32);
  const verifier = randomString(64);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const expires = new Date(Date.now() + 600_000).toISOString().replace("T", " ").slice(0, 19);
  await c.env.DB.prepare("DELETE FROM oauth_states WHERE expires_at < datetime('now')").run();
  await c.env.DB.prepare("INSERT INTO oauth_states (state, verifier, return_to, expires_at) VALUES (?, ?, ?, ?)")
    .bind(state, verifier, safeReturn(c.req.query("return_to")), expires).run();

  const url = new URL(GOOGLE_AUTH);
  url.search = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri(c.env), response_type: "code",
    scope: "openid email profile", state, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
  }).toString();
  return c.redirect(url.toString());
});

type Claims = { iss: string; aud: string | string[]; sub: string; exp: number; email?: string; email_verified?: boolean; name?: string; picture?: string };

async function verifyGoogleIdToken(idToken: string, clientId: string): Promise<Claims | null> {
  const [h, p, s] = idToken.split(".");
  if (!h || !p || !s) return null;
  let header: { kid?: string; alg?: string };
  let claims: Claims;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlDecode(h)));
    claims = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || !header.kid) return null;
  const jwks = (await (await fetch(GOOGLE_JWKS)).json()) as { keys: JsonWebKey[] & { kid: string }[] };
  const jwk = jwks.keys.find((k: any) => k.kid === header.kid) as JsonWebKey | undefined;
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", { ...jwk, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlDecode(s), new TextEncoder().encode(`${h}.${p}`));
  if (!valid) return null;
  // Google signs every project's tokens with the same keys, so the audience pin is what ties it to us.
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!GOOGLE_ISSUERS.includes(claims.iss) || !aud.includes(clientId) || claims.exp * 1000 <= Date.now() || !claims.sub) return null;
  return claims;
}

account.get("/auth/google/callback", async (c) => {
  if (!googleEnabled(c.env)) return jsonError(c, 503, "E_OAUTH_NOT_CONFIGURED", "Google sign-in is not configured.");
  const { code, state } = c.req.query();
  if (!code || !state) return c.redirect("/login?error=missing_code");
  const stored = await c.env.DB.prepare("SELECT * FROM oauth_states WHERE state = ? AND expires_at > datetime('now')").bind(state)
    .first<{ verifier: string; return_to: string }>();
  await c.env.DB.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();
  if (!stored) return c.redirect("/login?error=bad_state");

  const tokenRes = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: c.env.GOOGLE_CLIENT_ID!, client_secret: c.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(c.env), grant_type: "authorization_code", code_verifier: stored.verifier,
    }),
  });
  const tokens = (await tokenRes.json().catch(() => ({}))) as { id_token?: string };
  const claims = tokens.id_token ? await verifyGoogleIdToken(tokens.id_token, c.env.GOOGLE_CLIENT_ID!) : null;
  if (!claims) return c.redirect("/login?error=google_failed");
  if (claims.email && claims.email_verified === false) return c.redirect("/login?error=email_unverified");
  if (!(await isInvited(c.env, claims.email))) return c.redirect("/login?error=not_invited");

  // Link on the immutable sub claim, never on email.
  let acct = await c.env.DB.prepare("SELECT id FROM accounts WHERE google_sub = ?").bind(claims.sub).first<{ id: string }>();
  if (!acct) {
    acct = { id: newId("acct_") };
    await c.env.DB.prepare("INSERT INTO accounts (id, name, email, avatar_url, google_sub) VALUES (?, ?, ?, ?, ?)")
      .bind(acct.id, claims.name ?? claims.email ?? "Account", claims.email ?? null, claims.picture ?? null, claims.sub).run();
  } else {
    await c.env.DB.prepare("UPDATE accounts SET name = COALESCE(?, name), email = COALESCE(?, email), avatar_url = COALESCE(?, avatar_url), updated_at = datetime('now') WHERE id = ?")
      .bind(claims.name ?? null, claims.email ?? null, claims.picture ?? null, acct.id).run();
  }
  c.header("Set-Cookie", await startSession(c.env, acct.id, "google"));
  return c.redirect(stored.return_to || "/settings/tokens");
});

account.post("/auth/logout", async (c) => {
  const p = c.get("principal");
  const sid = (c.req.header("cookie") ?? "").match(/al_session=([^;]+)/)?.[1];
  if (p?.kind === "session" && sid) await c.env.DB.prepare("UPDATE sessions SET revoked_at = datetime('now') WHERE id = ?").bind(decodeURIComponent(sid)).run();
  c.header("Set-Cookie", sessionCookie("", 0, isSecure(c.env)));
  return c.json({ ok: true });
});

// ── Me, tokens, usage ──────────────────────────────────────────────

account.get("/me", async (c) => {
  const p = c.get("principal");
  if (!p || p.kind === "internal") return c.json({ ok: true, account: null });
  const acct: Account = p.account;
  return c.json({
    ok: true,
    account: acct,
    usage: { today: await usageToday(c.env, acct.id), limit: dailyLimit(c.env, acct.plan), resets: "midnight IST" },
  });
});

account.get("/tokens", requireSession(), async (c) => {
  const p = c.get("principal") as { account: Account };
  const { results } = await c.env.DB.prepare(`SELECT id, name, token_prefix, last_used_at, created_at FROM api_tokens
    WHERE account_id = ? AND revoked_at IS NULL ORDER BY created_at DESC`).bind(p.account.id).all();
  return c.json({ ok: true, tokens: results });
});

account.post("/tokens", requireSession(), async (c) => {
  const p = c.get("principal") as { account: Account };
  const body = (await c.req.json().catch(() => ({}))) as { name?: string };
  const name = String(body.name ?? "").trim().slice(0, 60) || "My token";
  const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM api_tokens WHERE account_id = ? AND revoked_at IS NULL").bind(p.account.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_TOKENS) return jsonError(c, 400, "E_TOO_MANY", `You can have at most ${MAX_TOKENS} active tokens. Revoke one first.`);
  const { full, prefix } = newApiToken();
  const id = newId("tok_");
  await c.env.DB.prepare("INSERT INTO api_tokens (id, account_id, name, token_prefix, token_hash) VALUES (?, ?, ?, ?, ?)")
    .bind(id, p.account.id, name, prefix, await hashToken(full, c.env.TOKEN_PEPPER)).run();
  // The full token is returned exactly once; only its hash is stored.
  return c.json({ ok: true, token: { id, name, token_prefix: prefix, secret: full } });
});

account.delete("/tokens/:id", requireSession(), async (c) => {
  const p = c.get("principal") as { account: Account };
  const r = await c.env.DB.prepare("UPDATE api_tokens SET revoked_at = datetime('now') WHERE id = ? AND account_id = ? AND revoked_at IS NULL")
    .bind(c.req.param("id"), p.account.id).run();
  if (!r.meta.changes) return jsonError(c, 404, "E_NOT_FOUND", "Token not found.");
  return c.json({ ok: true });
});

account.get("/usage", requireSession(), async (c) => {
  const p = c.get("principal") as { account: Account };
  const { results: days } = await c.env.DB.prepare("SELECT day, calls FROM usage_daily WHERE account_id = ? ORDER BY day DESC LIMIT 30").bind(p.account.id).all();
  const { results: recent } = await c.env.DB.prepare("SELECT surface, tool, ok, created_at FROM usage_log WHERE account_id = ? ORDER BY id DESC LIMIT 25").bind(p.account.id).all();
  return c.json({ ok: true, days, recent });
});

