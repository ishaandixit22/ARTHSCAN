// "Sign in with Google" — OpenID Connect authorization-code flow with PKCE.
//
// Nothing is written to the database until Google has vouched for the user.
// The in-flight handshake (state, nonce, PKCE verifier, where to return) lives
// in a short-lived HttpOnly cookie, sealed with an HMAC so it can't be forged
// or altered, and scoped to /api/auth/google so no other request carries it.
//
//   begin  → redirect to Google + set handshake cookie
//   finish → check cookie + state, swap code for tokens, verify the ID token

import type { Env } from "../env.js";
import { b64url, b64urlDecode, hmacHex, randomString, secretEquals } from "./crypto.js";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const KEYS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

const COOKIE = "al_google";
const COOKIE_PATH = "/api/auth/google";
const HANDSHAKE_TTL_SEC = 600;
const CLOCK_SKEW_SEC = 60;

export const googleConfigured = (env: Env) =>
  env.GOOGLE_OAUTH_ENABLED === "true" && !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET;

const callbackUrl = (env: Env) => `${env.PUBLIC_SITE_ORIGIN.replace(/\/$/, "")}${COOKIE_PATH}/callback`;
const secure = (env: Env) => env.PUBLIC_SITE_ORIGIN.startsWith("https://");

// ── Sealed handshake cookie ────────────────────────────────────────

type Handshake = { state: string; nonce: string; verifier: string; returnTo: string; expires: number };

const json = new TextEncoder();
const text = new TextDecoder();
const seal = async (env: Env, body: string) => hmacHex(env.TOKEN_PEPPER, `google-handshake:${body}`);

async function packHandshake(env: Env, h: Handshake): Promise<string> {
  const body = b64url(json.encode(JSON.stringify(h)));
  return `${body}.${await seal(env, body)}`;
}

async function unpackHandshake(env: Env, raw: string | undefined): Promise<Handshake | null> {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const body = raw.slice(0, dot);
  if (!(await secretEquals(raw.slice(dot + 1), await seal(env, body)))) return null;
  try {
    const h = JSON.parse(text.decode(b64urlDecode(body))) as Handshake;
    return h.expires > Date.now() / 1000 ? h : null;
  } catch {
    return null;
  }
}

function handshakeCookie(env: Env, value: string, maxAge: number): string {
  return [`${COOKIE}=${value}`, `Path=${COOKIE_PATH}`, `Max-Age=${maxAge}`, "HttpOnly", "SameSite=Lax", ...(secure(env) ? ["Secure"] : [])].join("; ");
}

export const clearHandshakeCookie = (env: Env) => handshakeCookie(env, "", 0);

function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

// ── Begin ──────────────────────────────────────────────────────────

/** Where to send the browser, and the cookie that must ride along. */
export async function beginGoogleSignIn(env: Env, returnTo: string): Promise<{ location: string; cookie: string }> {
  const h: Handshake = {
    state: randomString(32),
    nonce: randomString(32),
    verifier: randomString(64),
    returnTo,
    expires: Math.floor(Date.now() / 1000) + HANDSHAKE_TTL_SEC,
  };
  const challenge = b64url(await crypto.subtle.digest("SHA-256", json.encode(h.verifier)));
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: callbackUrl(env),
    scope: "openid email profile",
    state: h.state,
    nonce: h.nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return { location: `${AUTHORIZE_URL}?${params}`, cookie: handshakeCookie(env, await packHandshake(env, h), HANDSHAKE_TTL_SEC) };
}

// ── Finish ─────────────────────────────────────────────────────────

export type GoogleIdentity = { sub: string; email: string | null; emailVerified: boolean; name: string | null; picture: string | null };
export type FinishResult = { ok: true; identity: GoogleIdentity; returnTo: string } | { ok: false; reason: string };

export async function finishGoogleSignIn(env: Env, query: Record<string, string>, cookieHeader: string | undefined): Promise<FinishResult> {
  if (query.error || !query.code) return { ok: false, reason: "missing_code" };
  const h = await unpackHandshake(env, readCookie(cookieHeader, COOKIE));
  // No cookie, a forged one, an expired one, or a state that isn't ours: all the same to us.
  if (!h || !query.state || !(await secretEquals(query.state, h.state))) return { ok: false, reason: "bad_state" };

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: query.code,
      redirect_uri: callbackUrl(env),
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      code_verifier: h.verifier,
    }),
  });
  const body = (await res.json().catch(() => null)) as { id_token?: string } | null;
  if (!res.ok || !body?.id_token) return { ok: false, reason: "google_failed" };

  const claims = await verifyIdToken(body.id_token, env.GOOGLE_CLIENT_ID!, h.nonce);
  if (!claims) return { ok: false, reason: "google_failed" };
  const emailVerified = claims.email_verified === true || claims.email_verified === "true";
  if (claims.email && !emailVerified) return { ok: false, reason: "email_unverified" };

  return {
    ok: true,
    returnTo: h.returnTo,
    identity: { sub: claims.sub, email: claims.email ?? null, emailVerified, name: claims.name ?? null, picture: claims.picture ?? null },
  };
}

// ── ID token verification ──────────────────────────────────────────

type IdClaims = {
  iss: string; sub: string; aud: string | string[]; azp?: string; exp: number; iat: number; nonce?: string;
  email?: string; email_verified?: boolean | string; name?: string; picture?: string;
};

// Google rotates its signing keys every few weeks and says how long each set
// is good for in Cache-Control; refetch early only when an unknown key appears.
let keyCache: { keys: Map<string, JsonWebKey>; until: number } | null = null;

async function signingKey(kid: string): Promise<JsonWebKey | undefined> {
  const fresh = keyCache && keyCache.until > Date.now();
  if (!fresh || !keyCache!.keys.has(kid)) {
    const res = await fetch(KEYS_URL);
    if (!res.ok) return keyCache?.keys.get(kid);
    const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1] ?? 3600);
    const { keys } = (await res.json()) as { keys: (JsonWebKey & { kid: string })[] };
    keyCache = { keys: new Map(keys.map((k) => [k.kid, k])), until: Date.now() + maxAge * 1000 };
  }
  return keyCache!.keys.get(kid);
}

async function verifyIdToken(token: string, clientId: string, nonce: string): Promise<IdClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts;

  let header: { alg?: string; kid?: string };
  let claims: IdClaims;
  try {
    header = JSON.parse(text.decode(b64urlDecode(headerPart)));
    claims = JSON.parse(text.decode(b64urlDecode(payloadPart)));
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || !header.kid) return null;

  const jwk = await signingKey(header.kid);
  if (!jwk) return null;
  const { kty, n, e } = jwk;
  const key = await crypto.subtle.importKey("jwk", { kty, n, e }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const signed = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlDecode(signaturePart), json.encode(`${headerPart}.${payloadPart}`));
  if (!signed) return null;

  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  // Google signs ID tokens for every app with the same keys; only the audience says the token is for us.
  if (!ISSUERS.has(claims.iss) || !audiences.includes(clientId)) return null;
  if (audiences.length > 1 && claims.azp !== clientId) return null;
  if (!(claims.exp + CLOCK_SKEW_SEC > now) || !(claims.iat - CLOCK_SKEW_SEC <= now)) return null;
  if (claims.nonce !== nonce || !claims.sub) return null;
  return claims;
}
