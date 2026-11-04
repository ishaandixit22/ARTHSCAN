// Every ten minutes while bidding can run, saves each open issue's subscription by category, whether
// or not anyone opens a page, so the day-wise build-up has each day's close. NSE's figure costs no
// IPO Guru quota, so it goes first; the provider's is asked for only where NSE has none.

import type { Env } from "../env.js";
import { creditedTimes, currentIssues, detail, useExchange } from "../handlers/ipo.js";
import { parseCategories } from "../lib/ipo.js";
import { calendar, liveCategories, recordCategories, sameCompany, type CategoryTimes } from "../lib/ipoguru.js";

const IST_MS = 5.5 * 3600_000;
// NSE posts its final file at about 19:00, so the window runs past the close of bidding.
const FIRST_MINUTE = 9 * 60 + 30;
const LAST_MINUTE = 19 * 60 + 30;

async function fromNse(env: Env, issue: { symbol: string; series: string; status: string }): Promise<CategoryTimes | null> {
  const d = await detail(env, issue);
  const cats = parseCategories(d?.cats, null);
  if (!cats.length) return null;
  // On SME issues NSE lists QIB bids against 0 shares offered and writes 0.00 times: unknown, not zero.
  const times = (key: string) => {
    const c = cats.find((x) => x.key === key);
    return c?.times === 0 && c.bid ? null : c?.times ?? null;
  };
  return { total: times("total"), qib: times("qib"), nii: times("nii"), snii: times("snii"), bnii: times("bnii"), retail: times("retail") };
}

export async function recordIpoCategories(env: Env, nowMs = Date.now()) {
  const ist = new Date(nowMs + IST_MS);
  const minute = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const dow = ist.getUTCDay();
  if (dow === 0 || dow === 6 || minute < FIRST_MINUTE || minute > LAST_MINUTE) return { issues: 0, saved: 0 };

  const today = ist.toISOString().slice(0, 10);
  const [cal, cur] = await Promise.all([calendar(env), currentIssues(env).catch(() => [])]);
  const open = cal.rows.filter((r) => r.open && r.close && r.open <= today && today <= r.close);
  const nseOnly = cur.filter((c) => c.status === "Active" && !cal.rows.some((r) => sameCompany(c.name, r.name)));
  let saved = 0;

  for (const r of open) {
    try {
      const n = cur.find((c) => sameCompany(c.name, r.name));
      const nse = n ? await fromNse(env, n) : null;
      const provider = creditedTimes(r.times_total, r.open, today);
      if (nse && useExchange(nse.total, provider)) {
        const qib = nse.qib ?? (await liveCategories(env, r.slug))?.qib ?? null;
        if (await recordCategories(env, r.slug, "nse", { ...nse, qib }, nowMs)) saved++;
        continue;
      }
      const live = await liveCategories(env, r.slug);
      if (live && (await recordCategories(env, r.slug, "ipoguru", live, nowMs))) saved++;
    } catch (err) {
      console.error(`ipo readings ${r.slug}:`, err instanceof Error ? err.message : err); // one issue never stops the rest
    }
  }
  for (const c of nseOnly) {
    try {
      const nse = await fromNse(env, c);
      if (nse && (await recordCategories(env, c.symbol, "nse", nse, nowMs))) saved++;
    } catch (err) {
      console.error(`ipo readings ${c.symbol}:`, err instanceof Error ? err.message : err);
    }
  }
  return { issues: open.length + nseOnly.length, saved };
}
