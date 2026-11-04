// Companies that have filed a draft offer document with SEBI, for the Expected tab on the IPO pages.
// SEBI's public filing lists give the company, the date and the page of the filing, and nothing else,
// so that is all a row carries: no price, size, dates or logo. A filing is not a promise of an issue.
//
// Only the first page of each list is read. The endpoint behind SEBI's paging answers an automated
// request with "Unauthorized Request Blocked", so don't work around it. Instead each read adds to the
// stored list, which covers about a month on the first read and grows from there.
//
// SEBI's website policy asks that the source be prominently acknowledged, and that its pages open in a
// new window rather than a frame. See the IPO page.

import type { Env } from "../env.js";
import { nameKey, sameCompany } from "./ipoguru.js";
import { UPSTREAM_TIMEOUT_MS } from "./upstream.js";

const LIST = (smid: number) => `https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&ssid=15&smid=${smid}`;
const DRAFT = 10, RED_HERRING = 11, FINAL = 12;
const CACHE_KEY = "sebi:filings";
const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; Arthscan/1.0; +https://arthscan.me)", accept: "text/html" };

/** A draft is shown for a year. SEBI's observations run about that long, and it publishes no list a page can check a lapse against. */
const SHOW_MONTHS = 12;
/** How long a company stays marked as past its draft, so an old filing can't return as expected. */
const KEEP_MOVED_ON_MONTHS = 36;
/** At most two reads a day, including after a failure, whatever the ten-minute cron does. */
const READ_EVERY_SECONDS = 12 * 3600;

export type ListRow = { filed: string; url: string; title: string };
export type Filing = { name: string; doc: "DRHP" | "UDRHP"; filed: string; url: string };
export type MovedOn = { name: string; filed: string };
export type Stored = { filings: Filing[]; moved_on: MovedOn[]; fetched_at: string | null; tried_at: number; error: string | null };

const MONTH: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ");

/** The rows of a listing page. A title can carry a second link after a <br>, which is dropped. */
export function parseList(html: string): ListRow[] {
  const rows: ListRow[] = [];
  for (const m of html.matchAll(/<td>([A-Z][a-z]{2}) (\d{2}), (\d{4})<\/td>\s*<td><a href="(https:\/\/www\.sebi\.gov\.in\/filings\/[^"]+)"[^>]*?title="([^"]*)"/g)) {
    const month = MONTH[m[1]];
    if (month) rows.push({ filed: `${m[3]}-${month}-${m[2]}`, url: m[4], title: decode(m[5]).split(/<br/i)[0].replace(/\s+/g, " ").trim() });
  }
  return rows;
}

/** A row that is itself a draft filing. Addenda, notices and titles without a document type are left out rather than guessed at. */
export function parseDraft(r: ListRow): Filing | null {
  if (/addendum|corrigendum|notice|withdraw/i.test(r.title)) return null;
  const m = /^(.+?)\s*[-–—:]+\s*(UDRHP(?:[\s-]*(?:I|1))?|DRHP)$/i.exec(r.title);
  if (!m) return null;
  return { name: m[1].trim(), doc: /^U/i.test(m[2]) ? "UDRHP" : "DRHP", filed: r.filed, url: r.url };
}

/** The company in a red herring or final prospectus row: "Jio Platforms Ltd.- Prospectus" is Jio Platforms Ltd. */
export const movedOnName = (title: string) => title.replace(/\s*[-–—:]+\s*(addendum|corrigendum|notice|rhp|red herring|prospectus)\b.*$/i, "").trim();

const monthsBefore = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
};

/** Adds a read to the stored list: each company once at its newest filing, with anything past its window dropped. */
export function merge(stored: Pick<Stored, "filings" | "moved_on">, read: { filings: Filing[]; moved_on: MovedOn[] }, today: string) {
  const newest = new Map<string, Filing>();
  for (const f of [...stored.filings, ...read.filings]) {
    const key = nameKey(f.name), have = newest.get(key);
    if (!have || f.filed > have.filed) newest.set(key, f);
  }
  const moved = new Map<string, MovedOn>();
  for (const m of [...stored.moved_on, ...read.moved_on]) {
    const key = nameKey(m.name), have = moved.get(key);
    if (!have || m.filed > have.filed) moved.set(key, m);
  }
  return {
    filings: [...newest.values()].filter((f) => f.filed >= monthsBefore(today, SHOW_MONTHS)).sort((a, b) => b.filed.localeCompare(a.filed) || a.name.localeCompare(b.name)),
    moved_on: [...moved.values()].filter((m) => m.filed >= monthsBefore(today, KEEP_MOVED_ON_MONTHS)),
  };
}

/** Drafts with no later red herring or final prospectus for the same company. A newer draft stands: the company has filed again. */
export const stillExpected = (filings: Filing[], movedOn: MovedOn[]) => filings.filter((f) => !movedOn.some((m) => m.filed >= f.filed && sameCompany(f.name, m.name)));

async function readList(smid: number): Promise<ListRow[]> {
  const res = await fetch(LIST(smid), { headers: HEADERS, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`list ${smid} answered ${res.status}`);
  const rows = parseList(await res.text());
  if (!rows.length) throw new Error(`list ${smid} had no rows`); // a block page or a changed layout, never an empty list
  return rows;
}

async function load(env: Env): Promise<Stored> {
  const row = await env.DB.prepare("SELECT body FROM external_cache WHERE key = ?").bind(CACHE_KEY).first<{ body: string }>();
  return row ? (JSON.parse(row.body) as Stored) : { filings: [], moved_on: [], fetched_at: null, tried_at: 0, error: null };
}

/** Called by the ten-minute cron; reads SEBI at most twice a day. A failed read keeps everything stored. */
export async function refreshFilings(env: Env, nowMs = Date.now()): Promise<{ read: boolean; filings: number; error: string | null }> {
  const stored = await load(env);
  const now = Math.floor(nowMs / 1000);
  if (now - stored.tried_at < READ_EVERY_SECONDS) return { read: false, filings: stored.filings.length, error: stored.error };
  const today = new Date(nowMs + 5.5 * 3600_000).toISOString().slice(0, 10);
  let next: Stored;
  try {
    // One after another: this is a regulator's website, and there is no hurry.
    const draft = await readList(DRAFT);
    const redHerring = await readList(RED_HERRING);
    const final = await readList(FINAL);
    const read = {
      filings: draft.map(parseDraft).filter((f): f is Filing => !!f),
      moved_on: [...redHerring, ...final].map((r) => ({ name: movedOnName(r.title), filed: r.filed })).filter((m) => m.name),
    };
    next = { ...merge(stored, read, today), fetched_at: new Date(nowMs).toISOString(), tried_at: now, error: null };
  } catch (err) {
    console.error("sebi filings:", err instanceof Error ? err.message : err);
    next = { ...stored, tried_at: now, error: "SEBI's filing list could not be read" };
  }
  await env.DB.prepare("INSERT INTO external_cache (key, body, fetched_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at").bind(CACHE_KEY, JSON.stringify(next), now).run();
  return { read: true, filings: next.filings.length, error: next.error };
}

/** What a page shows. Only reads the database, so no visitor ever waits on SEBI. */
export async function expectedFilings(env: Env) {
  const s = await load(env);
  return { filings: stillExpected(s.filings, s.moved_on), fetched_at: s.fetched_at, error: s.error };
}
