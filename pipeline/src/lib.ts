// Shared helpers for pipeline jobs: polite NSE downloads, CSV parsing, dates.

import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync, strFromU8 } from "fflate";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CACHE = resolve(ROOT, "data/cache");

// NSE's archive host rejects requests without an ordinary browser user agent.
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "en-IN,en;q=0.9",
};

export class NotFound extends Error {}

/**
 * GET a public NSE archive file, with retries and an on-disk cache so a
 * backfill can be re-run without downloading everything again. Returns null
 * for 404 (holidays have no bhavcopy).
 */
export async function download(url: string, { cache = true } = {}): Promise<Uint8Array | null> {
  const cachePath = resolve(CACHE, url.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9._-]/g, "_"));
  if (cache && existsSync(cachePath)) return new Uint8Array(readFileSync(cachePath));

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      if (cache) {
        mkdirSync(CACHE, { recursive: true });
        writeFileSync(cachePath, buf);
      }
      return buf;
    } catch (err) {
      lastErr = err;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw lastErr;
}

export function unzipFirst(buf: Uint8Array): string {
  const files = unzipSync(buf);
  const first = Object.keys(files)[0];
  if (!first) throw new Error("empty zip");
  return strFromU8(files[first]);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** RFC-4180-ish CSV → array of header-keyed rows (headers trimmed). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  if (!header) return [];
  const keys = header.map((h) => h.trim().replace(/^﻿/, ""));
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

export function num(v: string | undefined): number | null {
  if (v === undefined) return null;
  const s = v.replace(/,/g, "").trim();
  if (s === "" || s === "-" || s.toUpperCase() === "NA") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const MONTHS: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

/** Accepts YYYY-MM-DD, DD-MMM-YYYY, DD-MM-YYYY or DD/MM/YYYY; returns YYYY-MM-DD. */
export function isoDate(v: string): string | null {
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m = /^(\d{1,2})[-\s/]([A-Za-z]{3})[-\s/](\d{4})$/.exec(s);
  if (m) {
    const mon = MONTHS[m[2].toUpperCase()];
    return mon ? `${m[3]}-${mon}-${m[1].padStart(2, "0")}` : null;
  }
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/** Today's date in India (the market's calendar), as YYYY-MM-DD. */
export function todayIST(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function isWeekday(iso: string): boolean {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6;
}
