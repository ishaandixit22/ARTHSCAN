// Blobs split across rows, since a D1 row holds at most 2 MB, and a tiny per-isolate memory of them.

import type { Env } from "../env.js";

const PART_CHARS = 1_900_000;
/** Bytes per part of a binary blob: three-quarters of the base64 limit, so each part decodes alone. */
export const PART_BYTES = (PART_CHARS / 4) * 3;

export function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}
export function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export const floatsToBase64 = (f: Float32Array) => toBase64(new Uint8Array(f.buffer, f.byteOffset, f.byteLength));
export function base64ToFloats(s: string | null): Float32Array {
  if (!s) return new Float32Array(0);
  const b = fromBase64(s);
  return new Float32Array(b.buffer, b.byteOffset, Math.floor(b.byteLength / 4));
}

export async function writeBlob(env: Env, name: string, build: string, text: string) {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += PART_CHARS) parts.push(text.slice(i, i + PART_CHARS));
  // New parts first and the stale tail last: a reader that sees mixed builds treats the blob as absent.
  for (let i = 0; i < parts.length; i++) {
    await env.DB.prepare("INSERT OR REPLACE INTO screen_blobs (name, part, build, body) VALUES (?, ?, ?, ?)").bind(name, i, build, parts[i]).run();
  }
  await env.DB.prepare("DELETE FROM screen_blobs WHERE name = ? AND part >= ?").bind(name, parts.length).run();
}
export const writeBinary = (env: Env, name: string, build: string, f: Float32Array) => writeBlob(env, name, build, floatsToBase64(f));

export async function blobBuild(env: Env, name: string): Promise<string | null> {
  return (await env.DB.prepare("SELECT build FROM screen_blobs WHERE name = ? AND part = 0").bind(name).first<{ build: string }>())?.build ?? null;
}

export async function readBlob(env: Env, name: string): Promise<{ build: string; text: string } | null> {
  const { results: heads } = await env.DB.prepare("SELECT part, build FROM screen_blobs WHERE name = ? ORDER BY part").bind(name).all<{ part: number; build: string }>();
  if (!heads.length) return null;
  const bodies = await Promise.all(heads.map((h) => env.DB.prepare("SELECT body FROM screen_blobs WHERE name = ? AND part = ?").bind(name, h.part).first<{ body: string }>()));
  if (heads.some((h) => h.build !== heads[0].build)) return null; // a writer is part-way through
  return { build: heads[0].build, text: bodies.map((b) => b?.body ?? "").join("") };
}

/** Writes a large binary blob a part at a time, so the whole thing is never held in memory twice. */
export class BinaryWriter {
  private buf = new Uint8Array(PART_BYTES);
  private fill = 0;
  private part = 0;
  bytes = 0;
  constructor(private env: Env, private name: string, private build: string) {}
  async add(data: Uint8Array) {
    let at = 0;
    while (at < data.length) {
      const n = Math.min(data.length - at, PART_BYTES - this.fill);
      this.buf.set(data.subarray(at, at + n), this.fill);
      this.fill += n; at += n; this.bytes += n;
      if (this.fill === PART_BYTES) await this.flush();
    }
  }
  private async flush() {
    if (!this.fill) return;
    await this.env.DB.prepare("INSERT OR REPLACE INTO screen_blobs (name, part, build, body) VALUES (?, ?, ?, ?)")
      .bind(this.name, this.part++, this.build, toBase64(this.buf.subarray(0, this.fill))).run();
    this.fill = 0;
  }
  async close() { await this.flush(); return { parts: this.part, bytes: this.bytes }; }
}

/** Reads a binary blob into one buffer, a part at a time, keeping each part in the edge cache. */
export async function readBinary(env: Env, name: string, build: string, parts: number, bytes: number): Promise<Uint8Array | null> {
  const out = new Uint8Array(bytes);
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const read = async (part: number) => {
    const key = new Request(`https://screens.cache/${encodeURIComponent(name)}/${encodeURIComponent(build)}/${part}`);
    const hit = await cache?.match(key).catch(() => undefined);
    if (hit) { out.set(new Uint8Array(await hit.arrayBuffer()), part * PART_BYTES); return true; }
    const row = await env.DB.prepare("SELECT body FROM screen_blobs WHERE name = ? AND part = ? AND build = ?").bind(name, part, build).first<{ body: string }>();
    if (!row) return false;
    const b = fromBase64(row.body);
    out.set(b, part * PART_BYTES);
    if (cache) await cache.put(key, new Response(b as unknown as BodyInit, { headers: { "cache-control": "max-age=86400" } })).catch(() => {});
    return true;
  };
  const AT_ONCE = 6;
  for (let i = 0; i < parts; i += AT_ONCE) {
    const oks = await Promise.all(Array.from({ length: Math.min(AT_ONCE, parts - i) }, (_, k) => read(i + k)));
    if (oks.includes(false)) return null;
  }
  return out;
}

export async function deleteOldBuilds(env: Env, name: string, keep: string) {
  await env.DB.prepare("DELETE FROM screen_blobs WHERE name = ? AND build != ?").bind(name, keep).run();
}
