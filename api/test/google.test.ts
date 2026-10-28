import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { migrate, SqliteDatabase } from "../src/db/sqlite.js";
import type { Env } from "../src/env.js";
import { b64url } from "../src/lib/crypto.js";

const CLIENT_ID = "test-client.apps.googleusercontent.com";
const db = new SqliteDatabase(":memory:");
const env: Env = {
  DB: db, PUBLIC_SITE_ORIGIN: "https://arthscan.me", TOKEN_PEPPER: "pepper", INTERNAL_API_KEY: "i", FREE_DAILY_QUOTA: "50",
  INVITE_ONLY: "true", GOOGLE_OAUTH_ENABLED: "true", GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: "shh",
};
const req = (path: string, init: RequestInit = {}) => app.fetch(new Request(`https://arthscan.me${path}`, init), env);

// A stand-in Google: real RSA keys, so signatures are genuinely checked.
let keys: CryptoKeyPair;
let publicJwk: JsonWebKey;
let nextIdToken: (nonce: string) => Promise<string>;
let lastTokenRequest: URLSearchParams | null = null;

async function signIdToken(claims: Record<string, unknown>, kid = "k1") {
  const enc = new TextEncoder();
  const head = b64url(enc.encode(JSON.stringify({ alg: "RS256", kid, typ: "JWT" })));
  const body = b64url(enc.encode(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

const now = () => Math.floor(Date.now() / 1000);
const goodClaims = (nonce: string, extra: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com", aud: CLIENT_ID, sub: "g-123", email: "invited@example.com", email_verified: true,
  name: "Invited Person", iat: now(), exp: now() + 3600, nonce, ...extra,
});

beforeAll(async () => {
  migrate(db);
  db.raw.exec("INSERT INTO invites (email) VALUES ('invited@example.com')");
  keys = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"],
  )) as CryptoKeyPair;
  publicJwk = { ...(await crypto.subtle.exportKey("jwk", keys.publicKey)), kid: "k1" } as JsonWebKey;

  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://www.googleapis.com/oauth2/v3/certs")) {
      return new Response(JSON.stringify({ keys: [publicJwk] }), { headers: { "cache-control": "public, max-age=600" } });
    }
    if (url === "https://oauth2.googleapis.com/token") {
      lastTokenRequest = new URLSearchParams(String(init?.body));
      return Response.json({ id_token: await nextIdToken(pendingNonce) });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
});
afterAll(() => vi.unstubAllGlobals());

let pendingNonce = "";

/** Runs /start and returns what the browser would carry back to /callback. */
async function start(returnTo = "/settings/tokens") {
  const r = await req(`/api/auth/google/start?return_to=${encodeURIComponent(returnTo)}`);
  const location = new URL(r.headers.get("location")!);
  const cookie = r.headers.get("set-cookie")!.split(";")[0];
  pendingNonce = location.searchParams.get("nonce")!;
  return { r, location, cookie, state: location.searchParams.get("state")! };
}
const callback = (qs: string, cookie?: string) => req(`/api/auth/google/callback?${qs}`, cookie ? { headers: { cookie } } : {});
const errorOf = (r: Response) => new URL(r.headers.get("location")!, "https://x").searchParams.get("error");

describe("Google sign-in", () => {
  it("starts with PKCE, state and nonce, and a sealed cookie scoped to the callback", async () => {
    const { r, location } = await start();
    expect(r.status).toBe(302);
    expect(location.origin + location.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("redirect_uri")).toBe("https://arthscan.me/api/auth/google/callback");
    const setCookie = r.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/Path=\/api\/auth\/google/);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/Secure/);
  });

  it("signs in an invited user and returns them where they started", async () => {
    nextIdToken = (nonce) => signIdToken(goodClaims(nonce));
    const { cookie, state } = await start("/stock/TCS");
    const r = await callback(`code=abc&state=${state}`, cookie);
    expect(r.headers.get("location")).toBe("/stock/TCS");
    expect(r.headers.get("set-cookie")).toMatch(/al_session=sess_/);
    expect(lastTokenRequest?.get("code_verifier")).toMatch(/^[0-9a-z]{64}$/);
    const acct = db.raw.prepare("SELECT email, google_sub FROM accounts").get() as { email: string; google_sub: string };
    expect(acct).toEqual({ email: "invited@example.com", google_sub: "g-123" });
  });

  it("rejects a missing, tampered or mismatched handshake", async () => {
    nextIdToken = (nonce) => signIdToken(goodClaims(nonce));
    const { cookie, state } = await start();
    expect(errorOf(await callback(`code=abc&state=${state}`))).toBe("bad_state");
    expect(errorOf(await callback(`code=abc&state=${state}`, cookie.replace(/.$/, (ch) => (ch === "a" ? "b" : "a"))))).toBe("bad_state");
    expect(errorOf(await callback(`code=abc&state=not-the-state`, cookie))).toBe("bad_state");
  });

  it("rejects ID tokens with the wrong nonce, audience, signature or expiry", async () => {
    const cases: ((nonce: string) => Promise<string>)[] = [
      (n) => signIdToken(goodClaims(n + "x")),
      (n) => signIdToken(goodClaims(n, { aud: "someone-else" })),
      (n) => signIdToken(goodClaims(n, { exp: now() - 3600 })),
      (n) => signIdToken(goodClaims(n), "unknown-kid"),
      async (n) => (await signIdToken(goodClaims(n))).replace(/\.[^.]+$/, ".AAAA"),
    ];
    for (const make of cases) {
      nextIdToken = make;
      const { cookie, state } = await start();
      expect(errorOf(await callback(`code=abc&state=${state}`, cookie))).toBe("google_failed");
    }
  });

  it("refuses verified Google users who aren't invited", async () => {
    nextIdToken = (nonce) => signIdToken(goodClaims(nonce, { sub: "g-999", email: "stranger@example.com" }));
    const { cookie, state } = await start();
    expect(errorOf(await callback(`code=abc&state=${state}`, cookie))).toBe("not_invited");
  });

  it("refuses unverified email addresses", async () => {
    nextIdToken = (nonce) => signIdToken(goodClaims(nonce, { email_verified: false }));
    const { cookie, state } = await start();
    expect(errorOf(await callback(`code=abc&state=${state}`, cookie))).toBe("email_unverified");
  });
});
