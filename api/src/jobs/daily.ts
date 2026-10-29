// The scheduled daily refresh, run by Cloudflare Cron Triggers on weekday
// evenings (see wrangler.jsonc) and on demand by the owner. It loads the
// session's end-of-day data straight into D1, so the site no longer depends on
// a laptop running the pipeline:
//
//   1. prices        NSE bhavcopy                 → daily_prices (+ new listings in stocks)
//   2. deliveries    sec_bhavdata_full            → daily_prices.deliv_*
//   3. indices       ind_close_all                → index_daily (closes, P/E, P/B, yield)
//   4. FII / DII     NSE provisional activity     → fii_dii
//   5. F&O ban       today's and the next session → fo_ban, fo_ban_days
//   6. open interest combineoi                    → fo_oi
//   7. splits        new jumps on this date       → price_adjustments, daily_prices.adj
//   8. results       quarterly figures (provider) → financials, results_checks
//   9. metrics       every stock, recomputed      → stock_metrics
//
// Every step is idempotent and independent: a missing file (holiday, not yet
// published) or a failure skips that step and is logged in pipeline_runs.
// Metrics are recomputed only when prices, splits or results changed.

import { unzipSync, strFromU8 } from "fflate";
import type { Env } from "../env.js";
import { filingKind } from "../handlers/filings.js";
import { csvObjects, num } from "../lib/csv.js";
import { type Bar, METRIC_COLUMNS, metricsRow, snapRatio, ttmEps } from "../lib/indicators.js";
import { addDaysISO, nseDate, NSE_HEADERS, nseFetch, nseQueryDate, todayIST } from "../lib/nse.js";
import { currentQuarterEnd, FINANCIAL_COLUMNS, providerName, quarterRows, type Series } from "../lib/results.js";

export type StepReport = { step: string; status: "ok" | "exists" | "skipped" | "error"; rows?: number; message?: string };
export type DailyReport = { date: string | null; steps: StepReport[]; ms: number };

const SERIES = new Set(["EQ", "BE", "BZ", "SM", "ST"]);
const ddmmyyyy = (d: string) => `${d.slice(8, 10)}${d.slice(5, 7)}${d.slice(0, 4)}`;
const isWeekday = (d: string) => { const w = new Date(`${d}T00:00:00Z`).getUTCDay(); return w !== 0 && w !== 6; };
const nextWeekday = (d: string) => { let x = addDaysISO(d, 1); while (!isWeekday(x)) x = addDaysISO(x, 1); return x; };

/** GET an NSE file; null when it isn't there (holiday, not yet published). */
async function nseFile(url: string): Promise<Uint8Array | null> {
  const res = await fetch(url, { headers: { ...NSE_HEADERS, accept: "*/*" }, signal: AbortSignal.timeout(30_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.split("/").pop()}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  // NSE answers some missing files with an HTML page instead of a 404.
  if (buf[0] === 0x3c /* < */) return null;
  return buf;
}
const text = (b: Uint8Array) => new TextDecoder().decode(b);
const unzipFirst = (b: Uint8Array) => strFromU8(Object.values(unzipSync(b))[0]);

/**
 * Writes rows through one JSON parameter per chunk (D1 allows 100 bound
 * parameters a query): `INSERT … SELECT json_extract(value, '$[0]'), … FROM json_each(?)`.
 */
async function insertRows(env: Env, head: string, columns: number, rows: unknown[][], chunk = 300, tail = ""): Promise<number> {
  const sel = Array.from({ length: columns }, (_, i) => `json_extract(value, '$[${i}]')`).join(", ");
  for (let i = 0; i < rows.length; i += chunk) {
    await env.DB.prepare(`${head} SELECT ${sel} FROM json_each(?) ${tail}`).bind(JSON.stringify(rows.slice(i, i + chunk))).run();
  }
  return rows.length;
}

async function step(report: StepReport[], name: string, fn: () => Promise<Omit<StepReport, "step">>) {
  try {
    report.push({ step: name, ...(await fn()) });
  } catch (err) {
    console.error(`daily ${name}:`, err);
    report.push({ step: name, status: "error", message: err instanceof Error ? err.message.slice(0, 200) : String(err) });
  }
}

/** The session to load: the latest weekday up to today whose bhavcopy NSE has published. */
async function sessionDate(today: string): Promise<{ date: string; buf: Uint8Array | null } | null> {
  for (let i = 0, d = today; i < 7; i++, d = addDaysISO(d, -1)) {
    if (!isWeekday(d)) continue;
    const buf = await nseFile(`https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_${d.replace(/-/g, "")}_F_0000.csv.zip`);
    if (buf) return { date: d, buf };
  }
  return null;
}

export async function runDaily(env: Env, opts: { date?: string; force?: boolean; results?: number } = {}): Promise<DailyReport> {
  const started = Date.now();
  const steps: StepReport[] = [];
  const today = todayIST();
  let changed = !!opts.force;

  // 1. Prices.
  let date: string | null = null;
  await step(steps, "prices", async () => {
    const s = opts.date
      ? { date: opts.date, buf: await nseFile(`https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_${opts.date.replace(/-/g, "")}_F_0000.csv.zip`) }
      : await sessionDate(today);
    if (!s?.buf) return { status: "skipped", message: "No bhavcopy published in the last week" };
    date = s.date;
    const have = await env.DB.prepare("SELECT COUNT(*) AS n FROM daily_prices WHERE date = ?").bind(date).first<{ n: number }>();
    if ((have?.n ?? 0) > 0 && !opts.force) return { status: "exists", rows: have!.n, message: date };
    const rows = csvObjects(unzipFirst(s.buf)).filter((r) => SERIES.has(r.SctySrs) && num(r.ClsPric) !== null);
    // A symbol can trade before it reaches the equity list (fresh listings): add it to the master.
    // ("WHERE true" lets SQLite parse an upsert whose source is a SELECT.)
    await insertRows(env, "INSERT INTO stocks (symbol, name, isin, series)", 4,
      rows.map((r) => [r.TckrSymb, r.FinInstrmNm || r.TckrSymb, r.ISIN || null, r.SctySrs]), 300,
      "WHERE true ON CONFLICT(symbol) DO UPDATE SET series = excluded.series");
    await insertRows(env, "INSERT OR REPLACE INTO daily_prices (symbol, date, open, high, low, close, prev_close, volume, turnover, trades)", 10,
      rows.map((r) => [r.TckrSymb, date, num(r.OpnPric), num(r.HghPric), num(r.LwPric), num(r.ClsPric), num(r.PrvsClsgPric), num(r.TtlTradgVol), num(r.TtlTrfVal), num(r.TtlNbOfTxsExctd)]));
    changed = true;
    return { status: "ok", rows: rows.length, message: date };
  });

  if (date) {
    const d: string = date;

    // 2. Deliveries.
    await step(steps, "deliveries", async () => {
      const buf = await nseFile(`https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${ddmmyyyy(d)}.csv`);
      if (!buf) return { status: "skipped", message: "Not published yet" };
      const rows = csvObjects(text(buf)).flatMap((r) => (num(r.DELIV_PER) === null ? [] : [[r.SYMBOL, num(r.DELIV_QTY), num(r.DELIV_PER)]]));
      for (let i = 0; i < rows.length; i += 300) {
        await env.DB.prepare(`UPDATE daily_prices SET deliv_qty = j.q, deliv_pct = j.p
          FROM (SELECT json_extract(value, '$[0]') AS s, json_extract(value, '$[1]') AS q, json_extract(value, '$[2]') AS p FROM json_each(?)) AS j
          WHERE daily_prices.symbol = j.s AND daily_prices.date = ?`).bind(JSON.stringify(rows.slice(i, i + 300)), d).run();
      }
      return { status: "ok", rows: rows.length };
    });

    // 3. Index closes and valuations.
    await step(steps, "indices", async () => {
      const buf = await nseFile(`https://nsearchives.nseindia.com/content/indices/ind_close_all_${ddmmyyyy(d)}.csv`);
      if (!buf) return { status: "skipped", message: "Not published yet" };
      const rows = csvObjects(text(buf)).flatMap((r) => {
        const close = num(r["Closing Index Value"]);
        if (!r["Index Name"] || close === null) return [];
        // The file is for one session; its own date column is DD-MM-YYYY, so use the session's date.
        return [[r["Index Name"], d, num(r["Open Index Value"]), num(r["High Index Value"]), num(r["Low Index Value"]), close,
          num(r["Change(%)"]), num(r.Volume), num(r["Turnover (Rs. Cr.)"]), num(r["P/E"]), num(r["P/B"]), num(r["Div Yield"])]];
      });
      await insertRows(env, "INSERT OR REPLACE INTO index_daily (index_name, date, open, high, low, close, change_pct, volume, turnover_cr, pe, pb, div_yield)", 12, rows);
      return { status: "ok", rows: rows.length };
    });

    // 6. Open interest against the market-wide limit (near-ban list).
    await step(steps, "open interest", async () => {
      const buf = await nseFile(`https://nsearchives.nseindia.com/archives/nsccl/mwpl/combineoi_${ddmmyyyy(d)}.zip`);
      if (!buf) return { status: "skipped", message: "Not published yet" };
      const rows = csvObjects(unzipFirst(buf)).flatMap((r) => {
        const mwpl = num(r.MWPL), futEq = num(r["Future Equivalent Open Interest"]);
        if (!r["NSE Symbol"] || !mwpl) return [];
        return [[d, r["NSE Symbol"].trim(), mwpl, num(r["Open Interest"]), futEq, futEq == null ? null : Math.round((futEq / mwpl) * 10000) / 100, r["Limit for Next Day"]?.trim() || null]];
      });
      await env.DB.prepare("DELETE FROM fo_oi WHERE date = ?").bind(d).run();
      await insertRows(env, "INSERT OR REPLACE INTO fo_oi (date, symbol, mwpl, open_interest, fut_eq_oi, pct_mwpl, next_day_limit)", 7, rows);
      return { status: "ok", rows: rows.length };
    });

    // 7. Splits and bonuses that show up as a jump on this date.
    await step(steps, "splits", async () => {
      const { results: jumps } = await env.DB.prepare(`
        WITH t AS (SELECT symbol, date, close, LAG(close) OVER (PARTITION BY symbol ORDER BY date) AS pc FROM daily_prices WHERE date >= date(?, '-14 days') AND date <= ?)
        SELECT symbol, close / pc AS ratio FROM t WHERE date = ? AND pc > 0 AND (close / pc < 0.65 OR close / pc > 1.6)`).bind(d, d, d).all<{ symbol: string; ratio: number }>();
      let n = 0;
      for (const j of jumps) {
        const factor = snapRatio(j.ratio);
        if (factor === null) continue;
        const added = await env.DB.prepare(`INSERT INTO price_adjustments (symbol, ex_date, factor, source, note) VALUES (?, ?, ?, 'detected', ?)
          ON CONFLICT(symbol, ex_date) DO NOTHING`).bind(j.symbol, d, factor, `observed ${j.ratio.toFixed(4)}`).run();
        if (added.meta.changes) {
          await env.DB.prepare("UPDATE daily_prices SET adj = adj * ? WHERE symbol = ? AND date < ?").bind(factor, j.symbol, d).run();
          n++;
        }
      }
      if (n) changed = true;
      return { status: "ok", rows: n };
    });
  }

  // 4. FII / DII provisional figures (independent of the bhavcopy).
  await step(steps, "fii/dii", async () => {
    const res = await fetch("https://www.nseindia.com/api/fiidiiTradeReact", { headers: NSE_HEADERS, signal: AbortSignal.timeout(20_000) });
    const body = await res.text();
    if (!res.ok || body.trimStart().startsWith("<")) throw new Error(`NSE answered ${res.status}`);
    const rows = (JSON.parse(body) as { category: string; date: string; buyValue: string; sellValue: string; netValue: string }[]).flatMap((r) => {
      const cat = /^(FII|FPI)/i.test(r.category) ? "FII" : /^DII/i.test(r.category) ? "DII" : null;
      const day = nseDate(r.date);
      return cat && day ? [[day, cat, num(r.buyValue), num(r.sellValue), num(r.netValue)]] : [];
    });
    await insertRows(env, "INSERT OR REPLACE INTO fii_dii (date, category, buy_value, sell_value, net_value)", 5, rows);
    return { status: "ok", rows: rows.length, message: String(rows[0]?.[0] ?? "") };
  });

  // 5. F&O ban: the session just loaded and the next one (published after the close).
  await step(steps, "f&o ban", async () => {
    const base = date ?? today;
    let loaded = 0;
    for (const day of [base, nextWeekday(base)]) {
      const buf = await nseFile(`https://nsearchives.nseindia.com/archives/fo/sec_ban/fo_secban_${ddmmyyyy(day)}.csv`);
      if (!buf) continue;
      const lines = text(buf).split(/\r?\n/);
      // "Securities in Ban For Trade Date 29-OCT-2026:"; a file for another day isn't filed under this one.
      const forDate = nseDate(/Trade Date (\d{2}-[A-Za-z]{3}-\d{4})/i.exec(lines[0] ?? "")?.[1]);
      if (forDate && forDate !== day) continue;
      const symbols = lines.slice(1).map((l) => l.split(",")[1]?.trim()).filter((s): s is string => !!s && /^[A-Z0-9&-]+$/.test(s));
      await env.DB.batch([
        env.DB.prepare("DELETE FROM fo_ban WHERE date = ?").bind(day),
        ...symbols.map((s) => env.DB.prepare("INSERT OR IGNORE INTO fo_ban (date, symbol) VALUES (?, ?)").bind(day, s)),
        env.DB.prepare("INSERT OR REPLACE INTO fo_ban_days (date, stocks) VALUES (?, ?)").bind(day, symbols.length),
      ]);
      loaded++;
    }
    return loaded ? { status: "ok", rows: loaded } : { status: "skipped", message: "Not published yet" };
  });

  // 8. Results season: companies that filed results on NSE and aren't stored yet.
  await step(steps, "results", async () => {
    const max = opts.results ?? 40;
    if (!env.INDIANAPI_KEY || max <= 0) return { status: "skipped", message: "No provider key" };
    const quarter = currentQuarterEnd(today);
    const declared = new Set<string>();
    for (let start = addDaysISO(quarter, 1); start <= today; start = addDaysISO(start, 7)) {
      const end = addDaysISO(start, 6) < today ? addDaysISO(start, 6) : today;
      const r = await nseFetch(env, `https://www.nseindia.com/api/corporate-announcements?index=equities&from_date=${nseQueryDate(start)}&to_date=${nseQueryDate(end)}`,
        end < today ? 7 * 86400 : 1800,
        (body) => [...new Set((JSON.parse(body) as { symbol: string; desc: string; attchmntText: string }[])
          .filter((a) => filingKind(a.desc ?? "", a.attchmntText ?? "") === "results").map((a) => a.symbol))]);
      for (const s of r.data) declared.add(s);
    }
    const { results: queue } = await env.DB.prepare(`
      SELECT s.symbol, s.name FROM stocks s LEFT JOIN stock_metrics m ON m.symbol = s.symbol
      WHERE s.symbol IN (SELECT value FROM json_each(?))
        AND NOT EXISTS (SELECT 1 FROM financials f WHERE f.symbol = s.symbol AND f.period_type = 'Q' AND f.period_end = ?)
        AND NOT EXISTS (SELECT 1 FROM results_checks c WHERE c.symbol = s.symbol AND c.quarter_end = ? AND c.checked_at > datetime('now', '-1 day'))
      ORDER BY COALESCE(m.turnover, 0) DESC LIMIT ?`).bind(JSON.stringify([...declared]), quarter, quarter, max).all<{ symbol: string; name: string }>();
    let found = 0;
    for (const { symbol, name } of queue) {
      let series: Series | null = null;
      for (const q of [providerName(name), symbol]) {
        const res = await fetch(`${env.INDIANAPI_BASE_URL || "https://stock.indianapi.in"}/historical_stats?${new URLSearchParams({ stock_name: q, stats: "quarter_results" })}`,
          { headers: { "x-api-key": env.INDIANAPI_KEY }, signal: AbortSignal.timeout(20_000) });
        if (res.status === 429) throw new Error("Provider request limit reached");
        const j = res.ok ? ((await res.json().catch(() => null)) as Series | null) : null;
        if (j && (j.Sales || j.Revenue)) { series = j; break; }
      }
      const rows = series ? quarterRows(symbol, series) : [];
      const has = rows.some((r) => r[1] === quarter);
      if (rows.length) await insertRows(env, `INSERT OR REPLACE INTO financials (${FINANCIAL_COLUMNS.join(", ")})`, FINANCIAL_COLUMNS.length, rows);
      await env.DB.prepare("INSERT OR REPLACE INTO results_checks (symbol, quarter_end, checked_at, found) VALUES (?, ?, datetime('now'), ?)").bind(symbol, quarter, has ? 1 : 0).run();
      if (has) found++;
    }
    if (found) changed = true;
    return { status: "ok", rows: found, message: `${queue.length} asked, ${declared.size} declared on NSE` };
  });

  // 9. Metrics for every stock that traded in the last two weeks.
  await step(steps, "metrics", async () => {
    if (!changed) return { status: "skipped", message: "Nothing new to recompute" };
    const latest = (await env.DB.prepare("SELECT MAX(date) AS d FROM daily_prices").first<{ d: string }>())?.d;
    if (!latest) return { status: "skipped", message: "No prices" };
    const eps = ttmEps((await env.DB.prepare(`SELECT symbol, consolidated, eps FROM financials WHERE period_type = 'Q' AND eps IS NOT NULL
      ORDER BY symbol, consolidated DESC, period_end DESC`).all<{ symbol: string; consolidated: number; eps: number }>()).results);
    const promoter = new Map((await env.DB.prepare(`SELECT s.symbol, s.promoter FROM shareholding s
      JOIN (SELECT symbol, MAX(quarter_end) q FROM shareholding GROUP BY symbol) m ON m.symbol = s.symbol AND m.q = s.quarter_end`)
      .all<{ symbol: string; promoter: number }>()).results.map((r) => [r.symbol, r.promoter]));
    const { results: syms } = await env.DB.prepare("SELECT DISTINCT symbol FROM daily_prices WHERE date >= date(?, '-14 days')").bind(latest).all<{ symbol: string }>();
    let n = 0;
    // About 100 stocks × 270 sessions per read keeps each query and the Worker's memory small.
    for (let i = 0; i < syms.length; i += 100) {
      const batch = syms.slice(i, i + 100).map((s) => s.symbol);
      const { results: bars } = await env.DB.prepare(`
        SELECT symbol, date, close * adj AS close, prev_close * adj AS prev_close, volume / adj AS volume, turnover, deliv_pct FROM daily_prices
        WHERE symbol IN (SELECT value FROM json_each(?)) AND date >= date(?, '-400 days') ORDER BY symbol, date`).bind(JSON.stringify(batch), latest).all<Bar>();
      const rows: unknown[][] = [];
      for (let a = 0; a < bars.length; ) {
        let b = a;
        while (b < bars.length && bars[b].symbol === bars[a].symbol) b++;
        const row = metricsRow(bars.slice(a, b), latest, eps.get(bars[a].symbol) ?? null, promoter.get(bars[a].symbol) ?? null);
        if (row) rows.push(row);
        a = b;
      }
      n += await insertRows(env, `INSERT OR REPLACE INTO stock_metrics (${METRIC_COLUMNS.join(", ")})`, METRIC_COLUMNS.length, rows, 150);
    }
    // Stocks that stopped trading drop out, as in the full rebuild.
    await env.DB.prepare("DELETE FROM stock_metrics WHERE as_of < date(?, '-14 days')").bind(latest).run();
    return { status: "ok", rows: n, message: latest };
  });

  const ms = Date.now() - started;
  await env.DB.batch(steps.map((s) => env.DB.prepare("INSERT INTO pipeline_runs (job, target, status, rows, message) VALUES (?, ?, ?, ?, ?)")
    .bind(`daily:${s.step}`, date, s.status, s.rows ?? null, s.message ?? null))).catch((e) => console.error("pipeline_runs:", e));
  return { date, steps, ms };
}
