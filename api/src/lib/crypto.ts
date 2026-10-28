// Token and id helpers, Web Crypto only so they run unchanged on Workers.
//
// API tokens are 40 chars of CSPRNG output, not passwords, so a single
// peppered SHA-256 is the right hash (same construction as agentdraft's keys).

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function randomString(len: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let s = "";
  for (const b of bytes) s += ALPHABET[b % 36];
  return s;
}

export const newId = (prefix: string, len = 16) => `${prefix}${randomString(len)}`;

export function newApiToken(): { full: string; prefix: string } {
  const full = `al_${randomString(40)}`;
  return { full, prefix: full.slice(0, 11) };
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// The namespace predates the Arthscan rename; changing it would invalidate every stored hash.
export const hashToken = (full: string, pepper: string) => sha256Hex(`arthlens.token.v1|${pepper}|${full}`);

/** Constant-time compare via fixed-length digests. */
export async function secretEquals(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < da.length; i++) diff |= da.charCodeAt(i) ^ db.charCodeAt(i);
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
