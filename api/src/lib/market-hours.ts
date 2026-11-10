// NSE's equity session in India time: 9:15 am to 3:30 pm on weekdays that aren't
// exchange holidays. Live (Dhan) figures are trusted only inside the session and
// a short grace period after the close; outside it the feed's "previous close"
// has rolled over to today's close, so every change would read as 0%.

import type { Env } from "../env.js";
import { nseDate, nseFetch } from "./nse.js";

const OPEN_MIN = 9 * 60 + 15;
const CLOSE_MIN = 15 * 60 + 30;
const GRACE_MIN = 15;

/**
 * Sessions outside the normal timetable, in India time, as minutes since midnight.
 * NSE announces these by circular each year, so add new ones here and in
 * web/src/lib/session.svelte.ts. 2026-11-08 is Diwali Muhurat trading, on a Sunday.
 */
export const SPECIAL_SESSIONS: Record<string, { open: number; close: number }> = {
  "2026-11-08": { open: 14 * 60 + 20, close: 15 * 60 + 30 },
};

/** A weekday or a special session: the days NSE may publish an end-of-day file for (exchange holidays not considered). */
export function isSessionDay(date: string): boolean {
  if (SPECIAL_SESSIONS[date]) return true;
  const w = new Date(`${date}T00:00:00Z`).getUTCDay();
  return w !== 0 && w !== 6;
}

/** Whether a scheduled end-of-day refresh has a session to load: the 08:30 IST catch-up looks at yesterday, the evening runs at today. */
export function refreshDue(cron: string, now = Date.now()): boolean {
  const date = istClock(cron === MORNING_REFRESH_CRON ? now - 24 * 3600_000 : now).date;
  return isSessionDay(date);
}
export const MORNING_REFRESH_CRON = "0 3 * * *";

/** India date (YYYY-MM-DD), minutes since midnight and weekday (0 = Sunday). */
export function istClock(now = Date.now()) {
  const d = new Date(now + 5.5 * 3600_000);
  return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), weekday: d.getUTCDay() };
}

/** Within the session window on a weekday or special session (holidays not considered). */
export function inSessionHours(now = Date.now()): boolean {
  const c = istClock(now);
  const special = SPECIAL_SESSIONS[c.date];
  if (special) return c.minutes >= special.open && c.minutes <= special.close + GRACE_MIN;
  return c.weekday >= 1 && c.weekday <= 5 && c.minutes >= OPEN_MIN && c.minutes <= CLOSE_MIN + GRACE_MIN;
}

/** How far ahead to warn about a special session: NSE lists them in its yearly calendar, months early. */
const SPECIAL_WARN_DAYS = 60;

/** Dates NSE's holiday list marks with an asterisk (a special session on a holiday) coming up soon and missing from SPECIAL_SESSIONS. */
export function unlistedSpecialSessions(holidays: { date: string; name: string }[], today: string): { date: string; name: string }[] {
  const until = new Date(Date.parse(today) + SPECIAL_WARN_DAYS * 86400_000).toISOString().slice(0, 10);
  return holidays
    .filter((h) => h.name.trim().endsWith("*") && h.date >= today && h.date <= until && !SPECIAL_SESSIONS[h.date])
    .map((h) => ({ date: h.date, name: h.name.replace(/\*\s*$/, "").trim() }));
}

/**
 * NSE's equity (CM) trading holidays, as NSE's holiday-master listed them on 2026-11-10
 * (https://www.nseindia.com/resources/exchange-communication-holidays). Used when NSE doesn't
 * answer and no copy of that year is stored. NSE publishes each year's list around the new year;
 * the live list replaces this one, and the daily self-check warns while a year has no list.
 * A name ending in "*" is a holiday with a special session (see SPECIAL_SESSIONS).
 */
export const NSE_HOLIDAYS: Record<string, Record<string, string>> = {
  "2026": {
    "2026-01-15": "Municipal Corporation Election - Maharashtra",
    "2026-01-26": "Republic Day",
    "2026-02-15": "Mahashivratri",
    "2026-03-03": "Holi",
    "2026-03-21": "Id-Ul-Fitr (Ramadan Eid)",
    "2026-03-26": "Shri Ram Navami",
    "2026-03-31": "Shri Mahavir Jayanti",
    "2026-04-03": "Good Friday",
    "2026-04-14": "Dr. Baba Saheb Ambedkar Jayanti",
    "2026-05-01": "Maharashtra Day",
    "2026-05-28": "Bakri Id",
    "2026-06-26": "Muharram",
    "2026-08-15": "Independence Day",
    "2026-09-14": "Ganesh Chaturthi",
    "2026-10-02": "Mahatma Gandhi Jayanti",
    "2026-10-20": "Dussehra",
    "2026-11-08": "Diwali Laxmi Pujan*",
    "2026-11-10": "Diwali-Balipratipada",
    "2026-11-24": "Prakash Gurpurb Sri Guru Nanak Dev",
    "2026-12-25": "Christmas",
  },
};

const HOLIDAY_URL = "https://www.nseindia.com/api/holiday-master?type=trading";
const savedKey = (year: string) => `nse-calendar:${year}`;

type Holiday = { date: string; name: string };
export type Calendar = { holidays: Map<string, string>; source: Record<string, "nse" | "saved" | "built-in"> };

/** The years a list covers, each with its holidays. */
function byYear(list: Holiday[]): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>();
  for (const h of list) {
    const y = h.date.slice(0, 4);
    if (!out.has(y)) out.set(y, {});
    out.get(y)![h.date] = h.name;
  }
  return out;
}

/**
 * Every known NSE trading holiday. Per year the best source wins: NSE's live list (cached a day),
 * else the last copy NSE gave for that year (kept for good), else NSE_HOLIDAYS. A year in none of
 * them has no holidays listed, so only weekends close it.
 */
export async function tradingCalendar(env: Env): Promise<Calendar> {
  // Asked on every live answer, so held in memory for a few minutes per Worker instance.
  if (memo && memo.env === env && Date.now() - memo.at < MEMO_MS) return memo.calendar;
  const calendar = await readCalendar(env);
  memo = { env, at: Date.now(), calendar };
  return calendar;
}
const MEMO_MS = 10 * 60_000;
let memo: { env: Env; at: number; calendar: Calendar } | null = null;

async function readCalendar(env: Env): Promise<Calendar> {
  const years = new Map<string, { list: Record<string, string>; source: "nse" | "saved" | "built-in" }>();
  for (const [y, list] of Object.entries(NSE_HOLIDAYS)) years.set(y, { list, source: "built-in" });
  try {
    const rows = await env.DB.prepare("SELECT key, body FROM external_cache WHERE key LIKE 'nse-calendar:%'").all<{ key: string; body: string }>();
    for (const r of rows.results ?? []) years.set(r.key.slice(savedKey("").length), { list: JSON.parse(r.body), source: "saved" });
  } catch {
    // no stored copies; the built-in list stands
  }
  try {
    const live = byYear(await holidayList(env));
    const now = Math.floor(Date.now() / 1000);
    for (const [y, list] of live) {
      const saved = years.get(y);
      if (saved?.source !== "saved" || JSON.stringify(saved.list) !== JSON.stringify(list)) {
        await env.DB.prepare("INSERT OR REPLACE INTO external_cache (key, body, fetched_at) VALUES (?, ?, ?)").bind(savedKey(y), JSON.stringify(list), now).run().catch(() => null);
      }
      years.set(y, { list, source: "nse" });
    }
  } catch {
    // NSE didn't answer: stored and built-in lists stand
  }
  const holidays = new Map<string, string>();
  const source: Calendar["source"] = {};
  for (const [y, { list, source: s }] of years) {
    source[y] = s;
    for (const [d, n] of Object.entries(list)) holidays.set(d, n);
  }
  return { holidays, source };
}

/** NSE equity trading holidays as YYYY-MM-DD (see tradingCalendar). */
export async function tradingHolidays(env: Env): Promise<string[]> {
  return [...(await tradingCalendar(env)).holidays.keys()];
}

/** Whether NSE trades on this India date: a special session, or a weekday that isn't an NSE holiday. */
export async function isTradingDay(env: Env, date: string): Promise<boolean> {
  if (SPECIAL_SESSIONS[date]) return true;
  if (!isSessionDay(date)) return false;
  return !(await tradingCalendar(env)).holidays.has(date);
}

/** NSE's live holiday list with names (cached a day); throws if NSE doesn't answer. */
export async function holidayList(env: Env): Promise<Holiday[]> {
  const r = await nseFetch(env, HOLIDAY_URL, 24 * 3600, (body) =>
    ((JSON.parse(body).CM ?? []) as { tradingDate: string; description: string }[]).flatMap((h) => {
      const date = nseDate(h.tradingDate);
      return date ? [{ date, name: h.description }] : [];
    }));
  return r.data;
}

/** In session hours on a trading day (see isTradingDay). */
export async function marketOpen(env: Env, now = Date.now()): Promise<boolean> {
  if (!inSessionHours(now)) return false;
  // NSE lists these days as holidays, so the holiday check would wrongly close them.
  if (SPECIAL_SESSIONS[istClock(now).date]) return true;
  return isTradingDay(env, istClock(now).date);
}
