// IPO data from ipoguru.in (API v2, key in `X-API-KEY`): the calendar with each issue's current
// premium and overall subscription, one issue's full document, and on paid plans its category
// subscription, premium history and anchor book. The key's plan decides what can be asked for and
// how often, because the free plan allows 10 requests a day and 1 a minute: every answer is kept in
// external_cache, the quota left is remembered from the response headers, and when a request can't
// be spent the last stored copy is served. Nothing here ever throws at a page.
//
// Every page showing this data must carry a visible link to ipoguru.in (their terms, on all plans).

import type { Env } from "../env.js";
import { addWorkingDays } from "./ipo.js";
import { UPSTREAM_TIMEOUT_MS } from "./upstream.js";

const BASE = "https://www.ipoguru.in/api/v2";
export const PLANS = ["free", "basic", "standard", "pro"] as const;
export type Plan = (typeof PLANS)[number];

/** What each plan may ask for, and how long an answer is reused, in seconds. */
const POLICY: Record<Plan, { calendar: number; doc: number; live: number; reserve: number }> = {
  free: { calendar: 3 * 3600, doc: 24 * 3600, live: 0, reserve: 2 },
  basic: { calendar: 900, doc: 6 * 3600, live: 0, reserve: 20 },
  standard: { calendar: 300, doc: 3600, live: 600, reserve: 50 },
  pro: { calendar: 180, doc: 1800, live: 300, reserve: 100 },
};
const atLeast = (plan: Plan, min: Plan) => PLANS.indexOf(plan) >= PLANS.indexOf(min);

/** The plan a stored quota row says the key is on; free until an answer says otherwise. */
export type Quota = { plan: Plan; remaining: number | null; limit: number | null; retry_at: number; day: string };
const dayIST = (ms = Date.now()) => new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 10);

async function readCache<T>(env: Env, key: string): Promise<{ body: T; fetched_at: number } | null> {
  const row = await env.DB.prepare("SELECT body, fetched_at FROM external_cache WHERE key = ?").bind(key).first<{ body: string; fetched_at: number }>();
  return row ? { body: JSON.parse(row.body) as T, fetched_at: row.fetched_at } : null;
}
async function writeCache(env: Env, key: string, body: unknown, at = Math.floor(Date.now() / 1000)) {
  await env.DB.prepare("INSERT INTO external_cache (key, body, fetched_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at").bind(key, JSON.stringify(body), at).run();
}

export async function quota(env: Env): Promise<Quota> {
  const q = (await readCache<Quota>(env, "ipoguru:quota"))?.body;
  const day = dayIST();
  if (!q) return { plan: "free", remaining: null, limit: null, retry_at: 0, day };
  return q.day === day ? q : { ...q, remaining: q.limit, day }; // the daily quota resets at midnight India time
}

type Got<T> = { data: T | null; fetched_at: string | null; error: string | null };

/** One cached GET. Serves the stored copy while it is fresh, when the quota is nearly gone, and when the provider fails. */
async function get<T>(env: Env, path: string, ttl: (plan: Plan) => number): Promise<Got<T>> {
  const key = `ipoguru:${path}`;
  const stored = await readCache<T>(env, key);
  const q = await quota(env);
  const now = Math.floor(Date.now() / 1000);
  const copy = (error: string | null): Got<T> => ({ data: stored?.body ?? null, fetched_at: stored ? new Date(stored.fetched_at * 1000).toISOString() : null, error });
  if (!env.IPOGURU_API_KEY) return copy(null);
  if (stored && now - stored.fetched_at <= ttl(q.plan)) return copy(null);
  if (now < q.retry_at) return copy("the provider's per-minute limit is in use");
  // The last few requests of the day go only to issues nothing is stored for.
  if (q.remaining != null && q.remaining <= (stored ? POLICY[q.plan].reserve : 0)) return copy("today's request quota is used up");
  try {
    const res = await fetch(`${BASE}${path}`, { headers: { "X-API-KEY": env.IPOGURU_API_KEY, accept: "application/json" }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    const plan = String(res.headers.get("x-plan") ?? q.plan).toLowerCase();
    const remaining = Number(res.headers.get("x-ratelimit-remaining"));
    const limit = Number(res.headers.get("x-ratelimit-limit"));
    const retry = Number(res.headers.get("retry-after")) || 0;
    await writeCache(env, "ipoguru:quota", {
      plan: (PLANS as readonly string[]).includes(plan) ? (plan as Plan) : q.plan,
      remaining: res.headers.has("x-ratelimit-remaining") && Number.isFinite(remaining) ? remaining : q.remaining,
      limit: res.headers.has("x-ratelimit-limit") && Number.isFinite(limit) ? limit : q.limit,
      retry_at: retry ? now + retry : plan === "free" ? now + 61 : 0, day: dayIST(), // free allows one request a minute
    } satisfies Quota);
    if (!res.ok) return copy(res.status === 429 ? "the provider's request limit is reached" : res.status === 401 || res.status === 403 ? "the key was refused" : res.status === 402 ? "the plan does not include this" : `the provider answered ${res.status}`);
    const body = (await res.json()) as { data?: T };
    if (body.data == null) return copy("the provider returned no data");
    await writeCache(env, key, body.data, now);
    return { data: body.data, fetched_at: new Date(now * 1000).toISOString(), error: null };
  } catch (err) {
    console.error("ipoguru:", err instanceof Error ? err.message : err);
    return copy("the provider did not answer");
  }
}

/** A number from the provider's text fields ("1,200", "15.96", ""); null means unknown, and 0 is a real reading. */
export const toNum = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

export type GmpBlock = { price: number | null; pct: number | null; est_listing: number | null; kostak: number | null; sauda: number | null; updated: string | null };
/** "Subject to sauda" can hold several figures as published ("700,,9800"); the first one shows, and a malformed one is left out. */
export function parseGmp(g: any): GmpBlock {
  const sauda = g?.subject_to_sauda == null ? null : toNum(String(g.subject_to_sauda).split(/,,+/)[0]);
  return { price: toNum(g?.price), pct: toNum(g?.percentage), est_listing: toNum(g?.estimated_listing_price), kostak: toNum(g?.kostak), sauda, updated: g?.updated_at ?? null };
}

export type CalendarRow = {
  slug: string; name: string; board: "Mainboard" | "SME"; exchange: string | null; status: string; pre_rhp: boolean; listed: boolean; logo: string | null;
  open: string | null; close: string | null; allotment: string | null; listing: string | null;
  price_low: number | null; price_high: number | null; issue_price: number | null; size_cr: number | null; lot: number | null; min_investment: number | null;
  gmp: GmpBlock; times_total: number | null; listing_price: number | null; listing_gain: number | null; cmp: number | null; current_gain: number | null; url: string | null;
};
export function parseCalendarRow(r: any): CalendarRow {
  return {
    slug: r.slug, name: r.display_name || r.name, board: r.type === "SME" ? "SME" : "Mainboard", exchange: r.sub_type && r.sub_type !== "Equity" ? r.sub_type : null,
    status: r.status ?? "", pre_rhp: r.stage === "pre_rhp" || !!r.dates_tba, listed: !!r.is_listed, logo: r.logo ?? null,
    open: r.open_date ?? null, close: r.close_date ?? null, allotment: r.allotment_date ?? null, listing: r.listing_date ?? null,
    price_low: toNum(r.price_min), price_high: toNum(r.price_max), issue_price: toNum(r.issue_price), size_cr: toNum(r.issue_size), lot: toNum(r.lot_size), min_investment: toNum(r.min_investment),
    gmp: parseGmp(r.gmp), times_total: toNum(r.subscription_total), listing_price: toNum(r.listing_price), listing_gain: toNum(r.listing_gain_percent), cmp: toNum(r.cmp), current_gain: toNum(r.current_gain_percent), url: r.web_url ?? null,
  };
}

/**
 * The calendar: open, upcoming, closed and recently listed issues in one request. A changed
 * premium or subscription is also written to ipo_readings, so each issue builds its own intraday
 * record whatever the plan.
 */
export async function calendar(env: Env): Promise<{ rows: CalendarRow[]; fetched_at: string | null; error: string | null; plan: Plan; connected: boolean }> {
  const before = (await readCache<unknown>(env, "ipoguru:/ipos?months=3"))?.fetched_at ?? null;
  const r = await get<any[]>(env, "/ipos?months=3", (p) => POLICY[p].calendar);
  const rows = (r.data ?? []).filter((x) => x?.slug).map(parseCalendarRow);
  if (r.fetched_at && Math.floor(Date.parse(r.fetched_at) / 1000) !== before) await recordReadings(env, rows, Date.parse(r.fetched_at));
  return { rows, fetched_at: r.fetched_at, error: r.error, plan: (await quota(env)).plan, connected: !!env.IPOGURU_API_KEY };
}

/** Keeps one reading per change for issues still before listing. */
export async function recordReadings(env: Env, rows: CalendarRow[], at: number) {
  const live = rows.filter((r) => !r.listed && r.status !== "Upcoming" && (r.gmp.price != null || r.times_total != null));
  for (const r of live) {
    const last = await env.DB.prepare("SELECT gmp, times_total FROM ipo_readings WHERE slug = ? ORDER BY at DESC LIMIT 1").bind(r.slug).first<{ gmp: number | null; times_total: number | null }>();
    if (last && last.gmp === r.gmp.price && last.times_total === r.times_total) continue;
    await env.DB.prepare("INSERT OR IGNORE INTO ipo_readings (slug, at, gmp, times_total) VALUES (?, ?, ?, ?)").bind(r.slug, Math.floor(at / 1000), r.gmp.price, r.times_total).run();
  }
}

export async function readings(env: Env, slug: string): Promise<{ at: string; gmp: number | null; times_total: number | null }[]> {
  const { results } = await env.DB.prepare("SELECT at, gmp, times_total FROM ipo_readings WHERE slug = ? ORDER BY at").bind(slug).all<{ at: number; gmp: number | null; times_total: number | null }>();
  return (results ?? []).map((r) => ({ at: new Date(r.at * 1000).toISOString(), gmp: r.gmp, times_total: r.times_total }));
}

export type CategoryTimes = { total: number | null; qib: number | null; nii: number | null; snii: number | null; bnii: number | null; retail: number | null };

/** Keeps a reading when a category changed. Bids only grow, so a lower total is a stale copy and is passed over. */
export async function recordCategories(env: Env, slug: string, source: "nse" | "ipoguru", c: CategoryTimes, atMs: number): Promise<boolean> {
  if (Object.values(c).every((v) => v == null)) return false;
  const last = await env.DB.prepare("SELECT total, qib, nii, snii, bnii, retail FROM ipo_category_readings WHERE slug = ? ORDER BY at DESC LIMIT 1").bind(slug).first<CategoryTimes>();
  if (last && c.total != null && last.total != null && c.total < last.total) return false;
  if (last && (Object.keys(c) as (keyof CategoryTimes)[]).every((k) => last[k] === c[k])) return false;
  await env.DB.prepare("INSERT OR IGNORE INTO ipo_category_readings (slug, at, source, total, qib, nii, snii, bnii, retail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(slug, Math.floor(atMs / 1000), source, c.total, c.qib, c.nii, c.snii, c.bnii, c.retail).run();
  return true;
}

export type SubDay = CategoryTimes & { day: number; date: string; time: string };

/** One row per bidding day: the last reading of that day in India time, numbered from the opening day. */
export async function categoryDays(env: Env, slug: string, open: string | null, close: string | null, holidays: string[] = []): Promise<SubDay[]> {
  const { results } = await env.DB.prepare("SELECT at, total, qib, nii, snii, bnii, retail FROM ipo_category_readings WHERE slug = ? ORDER BY at").bind(slug).all<CategoryTimes & { at: number }>();
  const byDate = new Map<string, CategoryTimes & { at: number }>();
  for (const r of results ?? []) byDate.set(new Date(r.at * 1000 + 5.5 * 3600_000).toISOString().slice(0, 10), r);
  return [...byDate].filter(([d]) => (!open || d >= open) && (!close || d <= close)).map(([date, { at, ...times }]) => {
    let day = 1;
    for (let d = open ?? date; d < date; d = addWorkingDays(d, 1, holidays)) day++;
    return { ...times, day, date, time: new Date(at * 1000 + 5.5 * 3600_000).toISOString().slice(11, 16) };
  });
}

/** Reads a category tree from `/subscription`; the provider nests sNII and bNII under NII. */
export function parseLiveCategories(body: any): CategoryTimes | null {
  const rows: any[] = body?.categories ?? [];
  const nested = rows.flatMap((x) => x?.sub_categories ?? []);
  const times = (list: any[], key: RegExp) => {
    const hit = list.find((x) => key.test(String(x?.key)));
    return hit ? hit.times_value ?? toNum(hit.times) : null;
  };
  const out = { total: times(rows, /^total$/i), qib: times(rows, /^qib$/i), nii: times(rows, /^nii$/i), snii: times(nested, /^snii$/i), bnii: times(nested, /^bnii$/i), retail: times(rows, /^(retail|rii)$/i) };
  return Object.values(out).some((v) => v != null) ? out : null;
}

/** The provider's live category figures for one issue; null below Standard, which does not include them. */
export async function liveCategories(env: Env, slug: string): Promise<CategoryTimes | null> {
  if (!atLeast((await quota(env)).plan, "standard")) return null;
  return parseLiveCategories((await get<any>(env, `/ipos/${encodeURIComponent(slug)}/subscription`, live)).data);
}

const live = (p: Plan) => POLICY[p].live;

/** The whole document for one issue, with what the plan could reach. Paid blocks are simply absent below their plan. */
export async function issue(env: Env, slug: string) {
  const path = `/ipos/${encodeURIComponent(slug)}`;
  const doc = await get<any>(env, path, (p) => POLICY[p].doc);
  const { plan } = await quota(env);
  const none = { data: null, fetched_at: null, error: null };
  const [subscription, gmpHistory, subHistory, anchors] = await Promise.all([
    atLeast(plan, "standard") ? get<any>(env, `${path}/subscription`, live) : none,
    atLeast(plan, "standard") ? get<any>(env, `${path}/gmp/history`, live) : none,
    atLeast(plan, "pro") ? get<any>(env, `${path}/subscription/history`, live) : none,
    atLeast(plan, "standard") ? get<any>(env, `${path}/anchors`, (p) => POLICY[p].doc) : none,
  ]);
  return { doc: doc.data, fetched_at: doc.fetched_at, error: doc.error, plan, subscription: subscription.data, gmp_history: gmpHistory.data, subscription_history: subHistory.data, anchors: anchors.data };
}

/** The provider's flat category totals from an issue document, as numbers. */
export function parseSummary(s: any) {
  if (!s) return null;
  return { total: toNum(s.total), qib: toNum(s.qib), nii: toNum(s.nii), retail: toNum(s.retail), employee: toNum(s.employee), shareholder: toNum(s.shareholder), applications: toNum(s.applications), updated: s.updated_at ?? null };
}

/** Lower-cases and strips everything that varies between sources, so "M.K.Sons Fine Jewels" meets "M K Sons Fine Jewels Limited". */
export const nameKey = (name: string) => String(name).toLowerCase().replace(/\b(limited|ltd|ipo)\b/g, "").replace(/[^a-z0-9]/g, "");

/** Whether a provider name and an exchange name are the same company; one may carry extra words such as "(India)". */
export function sameCompany(a: string, b: string) {
  const x = nameKey(a), y = nameKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length < y.length ? [x, y] : [y, x];
  return short.length >= 5 && long.startsWith(short);
}
