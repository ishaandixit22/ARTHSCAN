// The morning health summary, sent after the self-check (jobs/check.ts) by email and WhatsApp (lib/notify.ts),
// and the instant alerts for scheduled runs that end in an error. Probes are cheap: one Dhan quote, stats and
// company-info read for one stock, and a few D1 reads. The data provider (Indian Stock API) isn't called here;
// the statement fill's last successful answer shows whether it is working.

import type { Env } from "../env.js";
import { priceStats, quote } from "../lib/chart.js";
import { companyInfo } from "../lib/dhan.js";
import { type Message, notify, type Sent } from "../lib/notify.js";
import { SCREENS } from "../screens/catalogue.js";
import type { CheckReport } from "./check.js";
import type { DailyReport } from "./daily.js";

export type Probe = { name: string; ok: boolean; detail: string };

const PROBE_SYMBOL = "RELIANCE";
const DAY_S = 86400;

async function probe(name: string, run: () => Promise<string>): Promise<Probe> {
  try {
    return { name, ok: true, detail: await run() };
  } catch (err) {
    return { name, ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
const need = (cond: unknown, why: unknown) => { if (!cond) throw new Error(String(why || "Failed")); };

export async function healthProbes(env: Env, check: CheckReport): Promise<Probe[]> {
  const expected = check.latest_published;
  return Promise.all([
    probe("Prices on the site", async () => {
      need(check.latest_loaded, "No prices stored");
      need(!expected || check.latest_loaded! >= expected, `Site has ${check.latest_loaded}, NSE has published ${expected}`);
      return `Latest session ${check.latest_loaded}`;
    }),
    probe("Dhan quote", async () => {
      const q = await quote(env, PROBE_SYMBOL);
      need(q.ok, !q.ok && q.error);
      return q.ok ? `${PROBE_SYMBOL} ${q.ltp} (${q.date ?? "no trade date"})` : "";
    }),
    probe("Dhan history and seasonality", async () => {
      const s = await priceStats(env, PROBE_SYMBOL);
      need(s.ok, !s.ok && s.error);
      if (!s.ok) return "";
      need(s.seasonality?.months?.length === 12, "Seasonality missing");
      return `${PROBE_SYMBOL} as of ${s.as_of}`;
    }),
    probe("Dhan company info", async () => {
      const c = await companyInfo(env, PROBE_SYMBOL);
      need(c.ok, !c.ok && (c as { error?: string }).error);
      return "Answering";
    }),
    probe("Dhan live feed login", async () => {
      need(env.LIVE_FEED, "No live feed binding");
      const feed = env.LIVE_FEED!.get(env.LIVE_FEED!.idFromName("dhan"));
      const r = (await (await feed.fetch(new Request("https://live/status"))).json()) as { status?: { state?: string }; tokenSetAt?: number | null };
      need(r.tokenSetAt, "No Dhan token stored");
      const days = Math.floor((Date.now() - r.tokenSetAt!) / 86400_000);
      return `Token set ${days} day${days === 1 ? "" : "s"} ago; feed ${r.status?.state ?? "unknown"}`;
    }),
    probe("Indian Stock API (statements, About)", async () => {
      const row = await env.DB.prepare("SELECT MAX(fetched_at) AS t FROM company_statements WHERE found = 1").first<{ t: number | null }>();
      const age = row?.t ? Math.floor(Date.now() / 1000) - row.t : null;
      need(age !== null && age < 2 * DAY_S, age === null ? "Never answered" : `No successful answer for ${Math.round(age / 3600)} hours (limit used up or key rejected?)`);
      return `Last answer ${Math.round(age! / 3600)} h ago`;
    }),
    probe("Screens", async () => {
      need(SCREENS.length >= 180, `Only ${SCREENS.length} screens in the catalogue`);
      const m = await env.DB.prepare("SELECT COUNT(*) AS n, MAX(as_of) AS d FROM stock_metrics").first<{ n: number; d: string | null }>();
      need((m?.n ?? 0) > 3000, `Only ${m?.n ?? 0} stocks have metrics`);
      return `${SCREENS.length} screens, ${m!.n} stocks with metrics as of ${m!.d}`;
    }),
  ]);
}

const day = (iso: string) => new Date(Date.parse(iso) + 5.5 * 3600_000).toISOString().slice(0, 10);

export function summaryMessage(check: CheckReport, probes: Probe[]): Message {
  const repairs = check.items.filter((i) => i.status === "fixed");
  const problems = [
    ...check.items.filter((i) => i.status === "failed" || i.status === "behind").map((i) => `${i.check}: ${i.message}`),
    ...probes.filter((p) => !p.ok).map((p) => `${p.name}: ${p.detail}`),
  ];
  const verdict = problems.length ? `${problems.length} problem${problems.length > 1 ? "s" : ""}` : "all good";
  const lines = [
    problems.length ? "Something needs attention:" : "Everything checked is working.",
    ...problems.map((p) => `  ✗ ${p}`),
    ...(repairs.length ? ["", "Repaired automatically:", ...repairs.map((r) => `  ↻ ${r.check}: ${r.message}`)] : []),
    "",
    "Checks:",
    ...probes.map((p) => `  ${p.ok ? "✓" : "✗"} ${p.name}: ${p.detail}`),
    ...check.items.filter((i) => i.status === "ok").map((i) => `  ✓ ${i.check}: ${i.message}`),
    "",
    "Details: https://arthscan.me/health",
  ];
  const short = [
    ...problems.map((p) => `✗ ${p}`),
    ...repairs.map((r) => `↻ ${r.check}`),
    `Prices: ${check.latest_loaded ?? "none"}`,
    `${probes.filter((p) => p.ok).length}/${probes.length} checks OK`,
  ].join("\n");
  return { subject: `Arthscan: ${verdict} (${day(check.at)})`, text: lines.join("\n"), short };
}

/** Runs the probes after a self-check and sends the morning summary. */
export async function sendSummary(env: Env, check: CheckReport): Promise<{ probes: Probe[]; sent: Sent }> {
  const probes = await healthProbes(env, check);
  return { probes, sent: await notify(env, summaryMessage(check, probes)) };
}

/** An alert for a scheduled refresh that ended with errors; null when there is nothing to report. */
export function failureMessage(daily: DailyReport | null, bse: { failedCalls: number; stocks: number } | null, when: string): Message | null {
  const lines = [
    ...(daily?.steps.filter((s) => s.status === "error").map((s) => `NSE ${s.step} (${daily.date ?? "no date"}): ${s.message ?? "error"}`) ?? []),
    ...(bse && bse.failedCalls ? [`BSE prices: ${bse.failedCalls} Dhan quote calls failed`] : []),
  ];
  if (!lines.length) return null;
  return {
    subject: `Arthscan alert: ${lines.length} failed step${lines.length > 1 ? "s" : ""} in the ${when} refresh`,
    text: [...lines, "", "The 10:00 IST self-check will retry what it can. Details: https://arthscan.me/health"].join("\n"),
    short: lines.join("\n"),
  };
}

/** The evening note after the 22:00 IST refresh, when nothing failed: did today's session load? */
export function eveningMessage(daily: DailyReport, bse: { saved: number; stocks: number } | null, today: string): Message {
  const prices = daily.steps.find((s) => s.step === "prices");
  const loaded = daily.date === today && (prices?.status === "ok" || prices?.status === "exists");
  const steps = daily.steps.map((s) => `  ${s.status === "error" ? "✗" : "✓"} ${s.step}: ${s.status}${s.rows != null ? ` (${s.rows})` : ""}${s.message ? ` — ${s.message}` : ""}`);
  const head = loaded
    ? `Today's session (${today}) is loaded: ${prices?.rows ?? "?"} NSE stocks${bse ? `, ${bse.saved} BSE-only stocks` : ""}.`
    : `NSE hasn't published a file for ${today} (a market holiday, or late). The site shows ${daily.date ?? "no"} prices; the 08:30 run and the 10:00 IST check will load it if it appears.`;
  return {
    subject: loaded ? `Arthscan evening: ${today} loaded` : `Arthscan evening: no NSE session for ${today}`,
    text: [head, "", "Tonight's refresh:", ...steps, "", "Details: https://arthscan.me/health"].join("\n"),
    short: head,
  };
}
