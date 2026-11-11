// The funnel: visit -> signup -> first query -> weekly / monthly active. See migration 0022.
// "Active" = a signed-in, non-internal account that made at least one site query (an analysis page) or one
// authenticated MCP call. Plain REST/API-token calls are reported but do not count as active.

import type { Env } from "../env.js";
import { istDay } from "./crypto.js";

export const ATTRIBUTION_COOKIE = "al_src";
const SOCIAL = /(^|\.)(x|twitter|t|facebook|instagram|linkedin|reddit|youtube|youtu|telegram|t\.me|whatsapp|discord)\.(com|co|be|me)$|^t\.co$/;
const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|brave)\./;
const BOT = /bot|crawl|spider|headless|preview|slurp|lighthouse|monitor/i;

export const isBot = (ua: string | undefined) => !ua || BOT.test(ua);

export type Touch = { source: string | null; medium: string | null; campaign: string | null; channel: string; path: string | null };

const clean = (v: unknown, max = 60) => (typeof v === "string" && v.trim() ? v.trim().toLowerCase().slice(0, max) : null);

/** Turns what a landing page saw (UTM tags, the referrer's host) into one channel name. */
export function classifyTouch(input: { utm_source?: unknown; utm_medium?: unknown; utm_campaign?: unknown; ref?: unknown; path?: unknown }, ownHost = "arthscan.me"): Touch {
  const utm = clean(input.utm_source), medium = clean(input.utm_medium), campaign = clean(input.utm_campaign);
  let ref = clean(input.ref, 100)?.replace(/^www\./, "") ?? null;
  if (ref === ownHost) ref = null; // a page inside the site is not a source
  const source = utm ?? ref;
  let channel = "direct";
  if (utm || medium) {
    const m = medium ?? "";
    channel = /email|newsletter/.test(m) ? "email" : /cpc|paid|ppc|ads?$/.test(m) ? "paid" : /social/.test(m) || SOCIAL.test(utm ?? "") ? "social" : utm ? utm.replace(/[^a-z0-9_-]/g, "") || "campaign" : "campaign";
  } else if (ref) channel = SEARCH.test(ref) ? "search" : SOCIAL.test(ref) ? "social" : /chatgpt|openai|claude|perplexity|gemini/.test(ref) ? "ai" : "referral";
  const path = typeof input.path === "string" && input.path.startsWith("/") ? input.path.slice(0, 120) : null;
  return { source, medium, campaign, channel, path };
}

const insert = (env: Env, name: string, accountId: string | null, t: Pick<Touch, "channel" | "source" | "medium" | "campaign">, detail: string | null) =>
  env.DB.prepare("INSERT INTO events (name, day, account_id, channel, source, medium, campaign, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(name, istDay(), accountId, t.channel, t.source, t.medium, t.campaign, detail).run();

export const recordVisit = (env: Env, t: Touch) => insert(env, "visit", null, t, t.path);

/** The first-touch cookie the visit beacon set, kept on the new account. Never throws: a signup must not fail on analytics. */
export async function recordSignup(env: Env, accountId: string, cookie: string | undefined) {
  try {
    const raw = /(?:^|;\s*)al_src=([^;]+)/.exec(cookie ?? "")?.[1];
    const t = raw ? (JSON.parse(decodeURIComponent(raw)) as Partial<Touch>) : {};
    await insert(env, "signup", accountId, { channel: clean(t.channel) ?? "direct", source: clean(t.source), medium: clean(t.medium), campaign: clean(t.campaign) }, null);
  } catch (e) {
    console.error("signup event failed:", e);
  }
}

/** One row per account, page group and day. */
export async function recordQuery(env: Env, accountId: string, group: string) {
  await env.DB.prepare(`INSERT INTO events (name, day, account_id, detail) SELECT 'query', ?1, ?2, ?3
      WHERE NOT EXISTS (SELECT 1 FROM events WHERE name = 'query' AND day = ?1 AND account_id = ?2 AND detail = ?3)`)
    .bind(istDay(), accountId, group.slice(0, 40)).run();
}

const internalEmails = (env: Env) => [env.OWNER_EMAILS, env.INTERNAL_EMAILS].flatMap((v) => (v ?? "").split(",")).map((e) => e.trim().toLowerCase()).filter(Boolean);
const addDays = (day: string, n: number) => new Date(Date.parse(day) + n * 86_400_000).toISOString().slice(0, 10);

export interface FunnelRow { day: string; visits: number; signups: number; activated: number; activation_pct: number | null; wau: number; mau: number; mcp_mau: number }

export async function funnelReport(env: Env, days = 30) {
  days = Math.min(Math.max(days, 1), 90);
  const today = istDay(), first = addDays(today, -(days - 1)), from = addDays(first, -29);
  const internal = internalEmails(env);
  const skip = internal.length ? `AND account_id NOT IN (SELECT id FROM accounts WHERE lower(email) IN (${internal.map(() => "?").join(",")}))` : "";
  const db = env.DB;

  // Every active moment: (account, day, surface), de-duplicated, internal accounts left out.
  const { results: acts } = await db.prepare(`
    SELECT account_id AS a, day AS d, 'site' AS s FROM events WHERE name = 'query' AND day >= ? ${skip} GROUP BY a, d
    UNION SELECT account_id, date(created_at, '+330 minutes'), 'mcp' FROM usage_log
      WHERE surface = 'mcp' AND ok = 1 AND date(created_at, '+330 minutes') >= ? ${skip} GROUP BY 1, 2`)
    .bind(from, ...internal, from, ...internal).all<{ a: string; d: string; s: string }>();
  const { results: signups } = await db.prepare(`SELECT account_id AS a, day AS d, channel AS c FROM events WHERE name = 'signup' ${skip}`).bind(...internal).all<{ a: string; d: string; c: string }>();
  const { results: visits } = await db.prepare("SELECT day AS d, channel AS c, COUNT(*) AS n FROM events WHERE name = 'visit' AND day >= ? GROUP BY d, c").bind(first).all<{ d: string; c: string; n: number }>();
  const apiUsers = await db.prepare(`SELECT COUNT(DISTINCT account_id) AS n FROM usage_log WHERE surface = 'rest' AND ok = 1 AND created_at >= datetime('now', '-30 days') ${skip}`).bind(...internal).first<{ n: number }>();
  const total = (await db.prepare(`SELECT COUNT(*) AS n FROM accounts ${internal.length ? `WHERE lower(email) NOT IN (${internal.map(() => "?").join(",")})` : ""}`).bind(...internal).first<{ n: number }>())?.n ?? 0;

  const channelOf = new Map(signups.map((s) => [s.a, s.c]));
  const activeEver = new Set(acts.map((x) => x.a));
  const within = (rows: typeof acts, end: string, n: number, surface?: string) => {
    const start = addDays(end, -(n - 1));
    return new Set(rows.filter((x) => x.d >= start && x.d <= end && (!surface || x.s === surface)).map((x) => x.a)).size;
  };

  const rows: FunnelRow[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(first, i);
    const born = signups.filter((s) => s.d === day);
    const activated = born.filter((s) => activeEver.has(s.a)).length;
    rows.push({
      day, visits: visits.filter((v) => v.d === day).reduce((n, v) => n + v.n, 0), signups: born.length, activated,
      activation_pct: born.length ? Math.round((activated / born.length) * 1000) / 10 : null,
      wau: within(acts, day, 7), mau: within(acts, day, 30), mcp_mau: within(acts, day, 30, "mcp"),
    });
  }

  // The same figures by channel over the whole window. Accounts that signed up before tracking began are "unknown".
  const channels = new Set<string>([...visits.map((v) => v.c), ...signups.filter((s) => s.d >= first).map((s) => s.c), "unknown"]);
  const byChannel = [...channels].map((c) => {
    const mine = signups.filter((s) => s.c === c && s.d >= first);
    const active30 = new Set(acts.filter((x) => x.d > addDays(today, -30) && (channelOf.get(x.a) ?? "unknown") === c).map((x) => x.a));
    return {
      channel: c, visits: visits.filter((v) => v.c === c).reduce((n, v) => n + v.n, 0), signups: mine.length,
      activated: mine.filter((s) => activeEver.has(s.a)).length, mau: active30.size,
    };
  }).filter((r) => r.visits || r.signups || r.mau).sort((a, b) => b.mau - a.mau || b.signups - a.signups || b.visits - a.visits);

  return { as_of: today, window_days: days, accounts_total: total, api_token_users_30d: apiUsers?.n ?? 0, today: rows[rows.length - 1], rows, by_channel: byChannel };
}
