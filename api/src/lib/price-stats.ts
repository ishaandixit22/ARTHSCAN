// Calculations over a stock's full daily history. No I/O here: lib/chart.ts fetches the candles
// from Dhan, and the stock page shows what this works out.

export type Day = { date: string; open: number; high: number; low: number; close: number; volume: number };
/** Timestamp in milliseconds, open, high, low, close, volume: one candle, compact for the wire. */
export type Candle = [number, number, number, number, number, number];

const r2 = (v: number) => Math.round(v * 100) / 100;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const IST_S = 19800;
const SESSION_OPEN_MIN = 555; // 09:15 IST

const dayMs = (date: string) => Date.parse(`${date}T00:00:00+05:30`);

export function dailyCandles(days: Day[]): Candle[] {
  return days.map((d) => [dayMs(d.date), d.open, d.high, d.low, d.close, d.volume]);
}

function rollUp(days: Day[], key: (d: Day) => string): Candle[] {
  const out: Candle[] = [];
  let open: string | null = null;
  for (const d of days) {
    const k = key(d);
    const last = out[out.length - 1];
    if (k !== open || !last) {
      out.push([dayMs(d.date), d.open, d.high, d.low, d.close, d.volume]);
      open = k;
    } else {
      last[2] = Math.max(last[2], d.high);
      last[3] = Math.min(last[3], d.low);
      last[4] = d.close;
      last[5] += d.volume;
    }
  }
  return out;
}

/** The Monday of a date's week, which names the bar it belongs to. */
function weekOf(date: string): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  const weekday = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - weekday * 86400_000).toISOString().slice(0, 10);
}
export const weeklyCandles = (days: Day[]) => rollUp(days, (d) => weekOf(d.date));
export const monthlyCandles = (days: Day[]) => rollUp(days, (d) => d.date.slice(0, 7));

/**
 * Longer intraday bars from shorter ones, counted from the 09:15 open as the exchange's own are.
 * Input is [unix seconds, open, high, low, close, volume], oldest first.
 */
export function rollUpIntraday(bars: Candle[], minutes: number): Candle[] {
  const out: Candle[] = [];
  let open = -1;
  for (const [t, o, h, l, c, v] of bars) {
    const local = t + IST_S;
    const day = Math.floor(local / 86400);
    const fromOpen = Math.floor((local % 86400) / 60) - SESSION_OPEN_MIN;
    const bucket = day * 10000 + Math.floor(Math.max(0, fromOpen) / minutes);
    const last = out[out.length - 1];
    if (bucket !== open || !last) {
      out.push([t, o, h, l, c, v]);
      open = bucket;
    } else {
      last[2] = Math.max(last[2], h);
      last[3] = Math.min(last[3], l);
      last[4] = c;
      last[5] += v;
    }
  }
  return out;
}

// ── Returns ────────────────────────────────────────────────────────

const minusMonths = (date: string, months: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
};

/** Close on the last session on or before a date, or null if the history doesn't reach back that far. */
function closeOn(days: Day[], date: string): number | null {
  let lo = 0, hi = days.length - 1, hit = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (days[mid].date <= date) { hit = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return hit >= 0 ? days[hit].close : null;
}

export function returns(days: Day[]) {
  const last = days[days.length - 1];
  if (!last) return null;
  const from = (base: number | null) => (base ? r2((last.close / base - 1) * 100) : null);
  const weekAgo = new Date(Date.parse(`${last.date}T00:00:00Z`) - 7 * 86400_000).toISOString().slice(0, 10);
  return {
    ytd: from(closeOn(days, `${Number(last.date.slice(0, 4)) - 1}-12-31`)),
    w1: from(closeOn(days, weekAgo)),
    m1: from(closeOn(days, minusMonths(last.date, 1))),
    m3: from(closeOn(days, minusMonths(last.date, 3))),
    m6: from(closeOn(days, minusMonths(last.date, 6))),
    y1: from(closeOn(days, minusMonths(last.date, 12))),
    y2: from(closeOn(days, minusMonths(last.date, 24))),
    y3: from(closeOn(days, minusMonths(last.date, 36))),
    y5: from(closeOn(days, minusMonths(last.date, 60))),
  };
}

// ── Seasonality ────────────────────────────────────────────────────

export type MonthStat = {
  month: string; years: number; positive: number;
  avg_change: number | null; avg_positive: number | null; avg_negative: number | null;
  max_positive: { pct: number; year: number } | null; max_negative: { pct: number; year: number } | null;
};

/**
 * How the stock did in each calendar month, close of the month before to close of that month. The
 * month in progress is left out, and so is the month of listing, which has no earlier close.
 */
export function seasonality(days: Day[]) {
  const monthEnds = new Map<string, number>();
  for (const d of days) monthEnds.set(d.date.slice(0, 7), d.close);
  const keys = [...monthEnds.keys()];
  const byYear: Record<string, (number | null)[]> = {};
  const perMonth: { pct: number; year: number }[][] = MONTHS.map(() => []);
  for (let i = 1; i < keys.length - 1; i++) {
    const [y, m] = keys[i].split("-").map(Number);
    const pct = r2((monthEnds.get(keys[i])! / monthEnds.get(keys[i - 1])! - 1) * 100);
    perMonth[m - 1].push({ pct, year: y });
    (byYear[y] ??= Array(12).fill(null))[m - 1] = pct;
  }
  const avg = (xs: number[]) => (xs.length ? r2(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const months: MonthStat[] = perMonth.map((rows, i) => {
    const up = rows.filter((x) => x.pct > 0), down = rows.filter((x) => x.pct < 0);
    return {
      month: MONTHS[i], years: rows.length, positive: up.length,
      avg_change: avg(rows.map((x) => x.pct)), avg_positive: avg(up.map((x) => x.pct)), avg_negative: avg(down.map((x) => x.pct)),
      max_positive: up.length ? up.reduce((a, b) => (b.pct > a.pct ? b : a)) : null,
      max_negative: down.length ? down.reduce((a, b) => (b.pct < a.pct ? b : a)) : null,
    };
  });
  return { months, by_year: byYear };
}

// ── Extremes and beta ──────────────────────────────────────────────

export function extremes(days: Day[]) {
  if (!days.length) return null;
  let hi = days[0], lo = days[0];
  for (const d of days) {
    if (d.high > hi.high) hi = d;
    if (d.low > 0 && d.low < lo.low) lo = d;
  }
  // Intraday highs and lows, as the all-time figures are, so the two never disagree on the same page.
  const yearAgo = new Date(Date.parse(`${days.at(-1)!.date}T00:00:00Z`) - 365 * 86400_000).toISOString().slice(0, 10);
  const year = days.filter((d) => d.date > yearAgo);
  return {
    high: hi.high, high_date: hi.date, low: lo.low, low_date: lo.date, first_date: days[0].date,
    high_52w: Math.max(...year.map((d) => d.high)),
    low_52w: Math.min(...year.filter((d) => d.low > 0).map((d) => d.low)),
  };
}

/** Beta against an index over the last year of sessions both traded: covariance over the index's variance. */
export function beta(days: Day[], index: { date: string; close: number }[], sessions = 252): number | null {
  const idx = new Map(index.map((d) => [d.date, d.close]));
  const a: number[] = [], b: number[] = [];
  const recent = days.slice(-(sessions + 1));
  for (let i = 1; i < recent.length; i++) {
    const i0 = idx.get(recent[i - 1].date), i1 = idx.get(recent[i].date);
    if (!i0 || !i1 || !recent[i - 1].close) continue;
    a.push(recent[i].close / recent[i - 1].close - 1);
    b.push(i1 / i0 - 1);
  }
  if (a.length < 60) return null;
  const mean = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / xs.length;
  const ma = mean(a), mb = mean(b);
  let cov = 0, vari = 0;
  for (let i = 0; i < a.length; i++) {
    cov += (a[i] - ma) * (b[i] - mb);
    vari += (b[i] - mb) ** 2;
  }
  return vari ? r2(cov / vari) : null;
}

// ── Technicals ─────────────────────────────────────────────────────

export type Signal = "bullish" | "bearish" | "neutral";

const smaOf = (xs: number[], n: number) => (xs.length >= n ? xs.slice(-n).reduce((a, b) => a + b, 0) / n : null);
function emaSeries(xs: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out: number[] = [];
  xs.forEach((x, i) => out.push(i ? x * k + out[i - 1] * (1 - k) : x));
  return out;
}
const emaOf = (xs: number[], n: number) => (xs.length >= n ? emaSeries(xs, n)[xs.length - 1] : null);

function rsiOf(xs: number[], n = 14): number | null {
  if (xs.length <= n) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = xs[i] - xs[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  gain /= n;
  loss /= n;
  for (let i = n + 1; i < xs.length; i++) {
    const d = xs[i] - xs[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
  }
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}

/** Moving averages, oscillators and pivot levels at the latest close, each read as a plain signal. */
export function technicals(days: Day[]) {
  const last = days[days.length - 1];
  if (!last) return null;
  const closes = days.map((d) => d.close);
  const side = (avg: number | null): Signal => (avg == null ? "neutral" : last.close > avg ? "bullish" : last.close < avg ? "bearish" : "neutral");
  const averages = [5, 10, 20, 50, 100, 200].map((period) => {
    const sma = smaOf(closes, period), ema = emaOf(closes, period);
    return { period, sma: sma == null ? null : r2(sma), ema: ema == null ? null : r2(ema), sma_signal: side(sma), ema_signal: side(ema) };
  });

  const oscillators: { name: string; value: number; signal: Signal; reading: string }[] = [];
  const rsi = rsiOf(closes);
  if (rsi != null) oscillators.push({ name: "RSI (14)", value: r2(rsi), signal: rsi >= 70 || rsi <= 30 ? "neutral" : rsi > 50 ? "bullish" : "bearish", reading: rsi >= 70 ? "Overbought: has risen fast" : rsi <= 30 ? "Oversold: has fallen fast" : rsi > 50 ? "Buying has the edge" : "Selling has the edge" });

  if (closes.length >= 35) {
    const e12 = emaSeries(closes, 12), e26 = emaSeries(closes, 26);
    const line = closes.map((_, i) => e12[i] - e26[i]);
    const hist = line[line.length - 1] - emaSeries(line, 9)[line.length - 1];
    oscillators.push({ name: "MACD (12, 26, 9)", value: r2(line[line.length - 1]), signal: hist > 0 ? "bullish" : hist < 0 ? "bearish" : "neutral", reading: hist > 0 ? "Above its signal line" : "Below its signal line" });
  }
  if (days.length >= 14) {
    const w = days.slice(-14);
    const hi = Math.max(...w.map((d) => d.high)), lo = Math.min(...w.map((d) => d.low));
    if (hi > lo) {
      const k = ((last.close - lo) / (hi - lo)) * 100;
      oscillators.push({ name: "Stochastic (14)", value: r2(k), signal: k >= 80 || k <= 20 ? "neutral" : k > 50 ? "bullish" : "bearish", reading: k >= 80 ? "Near the top of its 14-day range" : k <= 20 ? "Near the bottom of its 14-day range" : k > 50 ? "In the upper half of its 14-day range" : "In the lower half of its 14-day range" });
    }
  }
  if (days.length >= 20) {
    const typical = days.slice(-20).map((d) => (d.high + d.low + d.close) / 3);
    const mean = typical.reduce((a, b) => a + b, 0) / 20;
    const dev = typical.reduce((a, b) => a + Math.abs(b - mean), 0) / 20;
    if (dev > 0) {
      const cci = (typical[19] - mean) / (0.015 * dev);
      oscillators.push({ name: "CCI (20)", value: r2(cci), signal: cci > 100 ? "bullish" : cci < -100 ? "bearish" : "neutral", reading: cci > 100 ? "Well above its recent average" : cci < -100 ? "Well below its recent average" : "Close to its recent average" });
    }
  }
  if (closes.length > 12) {
    const roc = (last.close / closes[closes.length - 13] - 1) * 100;
    oscillators.push({ name: "Rate of change (12)", value: r2(roc), signal: roc > 0 ? "bullish" : roc < 0 ? "bearish" : "neutral", reading: `${roc >= 0 ? "Up" : "Down"} ${Math.abs(roc).toFixed(1)}% in 12 sessions` });
  }

  // Classic floor-trader pivots from the latest session.
  const p = (last.high + last.low + last.close) / 3;
  const span = last.high - last.low;
  const pivots = { pivot: r2(p), r1: r2(2 * p - last.low), r2: r2(p + span), r3: r2(last.high + 2 * (p - last.low)), s1: r2(2 * p - last.high), s2: r2(p - span), s3: r2(last.low - 2 * (last.high - p)) };

  const votes = [...averages.flatMap((a) => (a.sma == null ? [] : [a.sma_signal, a.ema_signal])), ...oscillators.map((o) => o.signal)];
  const bullish = votes.filter((v) => v === "bullish").length, bearish = votes.filter((v) => v === "bearish").length;
  const trend: Signal = bullish >= bearish * 1.5 && bullish > 0 ? "bullish" : bearish >= bullish * 1.5 && bearish > 0 ? "bearish" : "neutral";
  return { as_of: last.date, close: last.close, averages, oscillators, pivots, votes: { bullish, bearish, neutral: votes.length - bullish - bearish }, trend };
}

// ── Volume ─────────────────────────────────────────────────────────

/** Latest session, the one before, and the 5- and 21-session averages. Delivery only where the exchange's file gives it. */
export function volumeAnalysis(days: Day[], delivery: Map<string, number | null> = new Map()) {
  const line = (window: Day[], label: string) => {
    if (!window.length) return null;
    const volume = Math.round(window.reduce((a, d) => a + d.volume, 0) / window.length);
    const shares = window.map((d) => ({ v: d.volume, p: delivery.get(d.date) })).filter((x) => x.p != null) as { v: number; p: number }[];
    const totalV = shares.reduce((a, x) => a + x.v, 0);
    const deliv_pct = shares.length === window.length && totalV ? r2(shares.reduce((a, x) => a + x.v * x.p, 0) / totalV) : null;
    return { label, volume, deliv_pct, deliv_volume: deliv_pct == null ? null : Math.round((volume * deliv_pct) / 100) };
  };
  return [line(days.slice(-1), "Latest"), line(days.slice(-2, -1), "Previous"), line(days.slice(-5), "1 week avg"), line(days.slice(-21), "1 month avg")].filter((x) => x !== null);
}
