// Per-stock metrics from a price series: returns, 52-week range, volatility,
// moving averages, RSI, MACD, crosses, breakouts and volume. Shared by the
// pipeline's full rebuild (local SQLite) and the Worker's scheduled daily
// refresh (D1), so both produce identical stock_metrics rows.

export type Bar = { symbol: string; date: string; close: number; prev_close: number | null; volume: number | null; turnover: number | null; deliv_pct: number | null };

export const round = (v: number | null, dp = 2) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 10 ** dp) / 10 ** dp);

function ret(closes: number[], back: number): number | null {
  const i = closes.length - 1 - back;
  if (i < 0) return null;
  return (closes[closes.length - 1] / closes[i] - 1) * 100;
}

function sma(closes: number[], n: number): number | null {
  if (closes.length < n) return null;
  let s = 0;
  for (let i = closes.length - n; i < closes.length; i++) s += closes[i];
  return s / n;
}

function volatility(closes: number[]): number | null {
  const window = closes.slice(-253);
  if (window.length < 60) return null;
  const r: number[] = [];
  for (let i = 1; i < window.length; i++) r.push(Math.log(window[i] / window[i - 1]));
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const variance = r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

/** Exponential moving average series; NaN until `n` values have been seen. */
function emaSeries(values: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out: number[] = [];
  let prev = NaN;
  values.forEach((v, i) => {
    if (i < n - 1) out.push(NaN);
    else if (i === n - 1) out.push((prev = values.slice(0, n).reduce((a, b) => a + b, 0) / n));
    else out.push((prev = v * k + prev * (1 - k)));
  });
  return out;
}

/** Wilder's 14-period RSI of the latest close. */
function rsi(closes: number[], n = 14): number | null {
  if (closes.length <= n) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  gain /= n; loss /= n;
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
  }
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}

/** MACD(12, 26, 9) at the latest close. */
function macd(closes: number[]) {
  if (closes.length < 35) return { macd: null, signal: null, hist: null };
  const fast = emaSeries(closes, 12), slow = emaSeries(closes, 26);
  const line = closes.map((_, i) => fast[i] - slow[i]).filter((v) => Number.isFinite(v));
  const signal = emaSeries(line, 9);
  const m = line[line.length - 1], s = signal[signal.length - 1];
  return { macd: m, signal: s, hist: m - s };
}

/** A 50/200-day moving-average cross within the last `within` sessions (golden = 50 crossed above 200). */
function recentCross(series: Bar[], within = 5): { kind: "golden" | "death"; date: string } | null {
  const closes = series.map((b) => b.close);
  if (closes.length < 200 + within) return null;
  const avg = (end: number, n: number) => closes.slice(end - n, end).reduce((a, b) => a + b, 0) / n;
  for (let back = 0; back < within; back++) {
    const end = closes.length - back;
    const diffNow = avg(end, 50) - avg(end, 200);
    const diffBefore = avg(end - 1, 50) - avg(end - 1, 200);
    if (diffNow > 0 && diffBefore <= 0) return { kind: "golden", date: series[end - 1].date };
    if (diffNow < 0 && diffBefore >= 0) return { kind: "death", date: series[end - 1].date };
  }
  return null;
}

/** Return vs the last close on or before `days` calendar days ago. */
function calendarReturn(series: Bar[], days: number): number | null {
  const last = series[series.length - 1];
  const target = new Date(Date.parse(last.date) - days * 86400_000).toISOString().slice(0, 10);
  // Allow the history to start up to a week after the target (holidays, a short backfill).
  if (series[0].date > new Date(Date.parse(target) + 7 * 86400_000).toISOString().slice(0, 10)) return null;
  let base = series[0];
  for (const b of series) {
    if (b.date > target) break;
    base = b;
  }
  return (last.close / base.close - 1) * 100;
}

/** Column order of a stock_metrics row, matching metricsRow's values. */
export const METRIC_COLUMNS = [
  "symbol", "as_of", "close", "change_pct", "volume", "turnover", "avg_volume_20d",
  "high_52w", "low_52w", "pct_from_high", "ret_1w", "ret_1m", "ret_3m", "ret_6m", "ret_1y", "volatility_1y",
  "sma_50", "sma_200", "pe", "eps_ttm", "promoter_pct", "first_date",
  "sma_20", "rsi_14", "macd", "macd_signal", "macd_hist", "cross_signal", "cross_date", "breakout", "vol_ratio", "deliv_pct", "deliv_pct_avg_20",
] as const;

/**
 * One stock_metrics row from a stock's adjusted price series (oldest first), or
 * null when the stock stopped trading more than ~2 weeks before `latest`.
 */
export function metricsRow(series: Bar[], latest: string, eps: number | null, promoter: number | null): (string | number | null)[] | null {
  const last = series[series.length - 1];
  if (!last || last.date < new Date(Date.parse(latest) - 14 * 86400_000).toISOString().slice(0, 10)) return null;

  const closes = series.map((b) => b.close);
  const year = series.slice(-252);
  const high = Math.max(...year.map((b) => b.close));
  const low = Math.min(...year.map((b) => b.close));
  const vols = series.slice(-20).map((b) => b.volume ?? 0);
  // Previous adjusted close, so an ex-date doesn't read as a -50% day.
  const prev = closes.length > 1 ? closes[closes.length - 2] : last.prev_close;

  // Signals compare today against the sessions before it.
  const priorYear = closes.slice(-253, -1);
  const breakout = priorYear.length >= 200
    ? last.close > Math.max(...priorYear) ? "high" : last.close < Math.min(...priorYear) ? "low" : null
    : null;
  const priorVols = series.slice(-21, -1).map((b) => b.volume ?? 0);
  const avgPriorVol = priorVols.length ? priorVols.reduce((a, b) => a + b, 0) / priorVols.length : 0;
  const delivs = series.slice(-20).map((b) => b.deliv_pct).filter((d): d is number => d !== null);
  const m = macd(closes);
  const cross = recentCross(series);

  return [
    last.symbol, last.date, last.close,
    round(prev ? (last.close / prev - 1) * 100 : null),
    last.volume, last.turnover,
    round(vols.reduce((a, b) => a + b, 0) / vols.length, 0),
    high, low, round((last.close / high - 1) * 100),
    round(ret(closes, 5)), round(ret(closes, 21)), round(ret(closes, 63)),
    round(ret(closes, 126)), round(calendarReturn(series, 365)),
    round(volatility(closes)),
    round(sma(closes, 50)), round(sma(closes, 200)),
    eps && eps > 0 ? round(last.close / eps) : null,
    round(eps),
    promoter,
    series[0].date,
    round(sma(closes, 20)), round(rsi(closes), 1),
    round(m.macd, 3), round(m.signal, 3), round(m.hist, 3),
    cross?.kind ?? null, cross?.date ?? null, breakout,
    avgPriorVol > 0 && last.volume ? round(last.volume / avgPriorVol) : null,
    last.deliv_pct, delivs.length >= 10 ? round(delivs.reduce((a, b) => a + b, 0) / delivs.length) : null,
  ];
}

/** TTM EPS per symbol: the last four quarters, consolidated preferred over standalone. Rows newest first per symbol. */
export function ttmEps(rows: { symbol: string; consolidated: number; eps: number }[]): Map<string, number> {
  const seen = new Map<string, { consolidated: number; n: number; sum: number }>();
  for (const r of rows) {
    const s = seen.get(r.symbol);
    if (!s) seen.set(r.symbol, { consolidated: r.consolidated, n: 1, sum: r.eps });
    else if (s.consolidated === r.consolidated && s.n < 4) { s.n++; s.sum += r.eps; }
  }
  return new Map([...seen].filter(([, s]) => s.n === 4).map(([sym, s]) => [sym, s.sum]));
}

// Splits and bonuses: a close-to-close move beyond -35%/+60% is almost always a
// corporate action; snap it to the nearest standard ratio if it's close.
const STANDARD = [1 / 10, 1 / 5, 1 / 4, 1 / 3, 2 / 5, 1 / 2, 3 / 5, 2 / 3, 3 / 4, 4 / 5, 5 / 4, 3 / 2, 2, 5 / 2, 3, 4, 5, 10];
export function snapRatio(ratio: number): number | null {
  let best: number | null = null;
  let err = Infinity;
  for (const s of STANDARD) {
    const e = Math.abs(Math.log(ratio / s));
    if (e < err) { err = e; best = s; }
  }
  return err < 0.12 ? best : null;
}
