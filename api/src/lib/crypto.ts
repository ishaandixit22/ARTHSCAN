// Ids, tokens and hashing — Web Crypto only, so this runs unchanged on Workers.
//
// Every secret we hand out (API tokens, OAuth codes, access and refresh
// tokens, client secrets) is stored only as HMAC-SHA256(TOKEN_PEPPER, value).
// The values are long random strings, not passwords, so a keyed hash is
// enough: there is nothing to brute-force, and without the pepper a leaked
// database can't even be used to test guesses.

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Random [0-9a-z] string with no modulo bias (bytes ≥ 252 are redrawn). */
export function randomString(len: number): string {
  let out = "";
  while (out.length < len) {
    for (const b of crypto.getRandomValues(new Uint8Array(len * 2))) {
      if (b < 252) out += ALPHABET[b % 36];
      if (out.length === len) break;
    }
  }
  return out;
}

export const newId = (prefix: string, len = 16) => `${prefix}${randomString(len)}`;

/** A personal API token; the first 11 characters are shown in the UI to tell tokens apart. */
export function newApiToken(): { full: string; prefix: string } {
  const full = `al_${randomString(40)}`;
  return { full, prefix: full.slice(0, 11) };
}

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
}

// Importing a key costs more than the HMAC itself; keep one per pepper.
const hmacKeys = new Map<string, Promise<CryptoKey>>();
function hmacKey(secret: string): Promise<CryptoKey> {
  let key = hmacKeys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    hmacKeys.set(secret, key);
  }
  return key;
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  return toHex(await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(message)));
}

/** The stored form of any issued secret. */
export const hashToken = (value: string, pepper: string) => hmacHex(pepper, value);

/** Equality that takes the same time wherever the inputs differ (both sides are hashed to equal length first). */
export async function secretEquals(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(input: string): Uint8Array<ArrayBuffer> {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const s = atob(input.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

/** Today in India — quota days roll over at IST midnight. */
export const istDay = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

/** A Date as SQLite's datetime() text, so it compares correctly with datetime('now'). */
export const sqlTime = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19);
