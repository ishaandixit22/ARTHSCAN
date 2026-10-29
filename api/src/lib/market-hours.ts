// NSE's equity session in India time: 9:15 am to 3:30 pm on weekdays that aren't
// exchange holidays. Live (Dhan) figures are trusted only inside the session and
// a short grace period after the close; outside it the feed's "previous close"
// has rolled over to today's close, so every change would read as 0%.

import type { Env } from "../env.js";
import { nseDate, nseFetch } from "./nse.js";

const OPEN_MIN = 9 * 60 + 15;
const CLOSE_MIN = 15 * 60 + 30;
const GRACE_MIN = 15;

/** India date (YYYY-MM-DD), minutes since midnight and weekday (0 = Sunday). */
export function istClock(now = Date.now()) {
  const d = new Date(now + 5.5 * 3600_000);
  return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), weekday: d.getUTCDay() };
}

/** Within the session window on a weekday (holidays not considered). */
export function inSessionHours(now = Date.now()): boolean {
  const c = istClock(now);
  return c.weekday >= 1 && c.weekday <= 5 && c.minutes >= OPEN_MIN && c.minutes <= CLOSE_MIN + GRACE_MIN;
}

/** NSE equity trading holidays as YYYY-MM-DD (cached a day); empty if NSE does not answer, so callers fall back to weekends only. */
export async function tradingHolidays(env: Env): Promise<string[]> {
  try {
    const r = await nseFetch(env, "https://www.nseindia.com/api/holiday-master?type=trading", 24 * 3600, (body) =>
      ((JSON.parse(body).CM ?? []) as { tradingDate: string }[]).map((h) => nseDate(h.tradingDate)).filter(Boolean) as string[]);
    return r.data;
  } catch {
    return [];
  }
}

/** In session and not an NSE trading holiday (holiday list cached a day; if NSE doesn't answer, assume open). */
export async function marketOpen(env: Env, now = Date.now()): Promise<boolean> {
  if (!inSessionHours(now)) return false;
  try {
    const r = await nseFetch(env, "https://www.nseindia.com/api/holiday-master?type=trading", 24 * 3600, (body) =>
      ((JSON.parse(body).CM ?? []) as { tradingDate: string }[]).map((h) => nseDate(h.tradingDate)).filter(Boolean) as string[]);
    return !r.data.includes(istClock(now).date);
  } catch {
    return true;
  }
}
