// Indicators over one stock's candles, on any candle size. No I/O. Each returns a series the same
// length as the candles, NaN until it has enough history; conventions are stated where they vary.

export type Candles = {
  /** Day number since 1970 for daily and longer; unix seconds for intraday. */
  t: Float64Array | number[];
  o: Float64Array; h: Float64Array; l: Float64Array; c: Float64Array; v: Float64Array;
};

const nanArray = (n: number) => new Float64Array(n).fill(NaN);

export function sma(x: ArrayLike<number>, n: number): Float64Array {
  const out = nanArray(x.length);
  let sum = 0, bad = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    if (Number.isNaN(v)) bad++; else sum += v;
    if (i >= n) { const p = x[i - n]; if (Number.isNaN(p)) bad--; else sum -= p; }
    if (i >= n - 1 && bad === 0) out[i] = sum / n;
  }
  return out;
}

/** Seeded with the simple average of the first n values. */
export function ema(x: ArrayLike<number>, n: number): Float64Array {
  const out = nanArray(x.length);
  const k = 2 / (n + 1);
  let start = 0;
  while (start < x.length && Number.isNaN(x[start])) start++;
  if (x.length - start < n) return out;
  let s = 0;
  for (let i = start; i < start + n; i++) s += x[i];
  let prev = s / n;
  out[start + n - 1] = prev;
  for (let i = start + n; i < x.length; i++) { prev = x[i] * k + prev * (1 - k); out[i] = prev; }
  return out;
}

export function wma(x: ArrayLike<number>, n: number): Float64Array {
  const out = nanArray(x.length);
  const div = (n * (n + 1)) / 2;
  for (let i = n - 1; i < x.length; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += x[i - j] * (n - j);
    out[i] = s / div;
  }
  return out;
}

/** Wilder's smoothing, seeded with the simple average of the first n values. */
function wilder(x: ArrayLike<number>, n: number, from = 0): Float64Array {
  const out = nanArray(x.length);
  if (x.length - from < n) return out;
  let s = 0;
  for (let i = from; i < from + n; i++) s += x[i];
  let prev = s / n;
  out[from + n - 1] = prev;
  for (let i = from + n; i < x.length; i++) { prev = (prev * (n - 1) + x[i]) / n; out[i] = prev; }
  return out;
}

/** Wilder's RSI. */
export function rsi(c: ArrayLike<number>, n: number): Float64Array {
  const len = c.length;
  const up = new Float64Array(len), dn = new Float64Array(len);
  for (let i = 1; i < len; i++) { const d = c[i] - c[i - 1]; up[i] = d > 0 ? d : 0; dn[i] = d < 0 ? -d : 0; }
  const a = wilder(up, n, 1), b = wilder(dn, n, 1);
  const out = nanArray(len);
  for (let i = 0; i < len; i++) if (!Number.isNaN(a[i])) out[i] = b[i] === 0 ? (a[i] === 0 ? 50 : 100) : 100 - 100 / (1 + a[i] / b[i]);
  return out;
}

/** MACD with arguments in the order the rules write them: (slow, fast, signal). */
export function macd(c: ArrayLike<number>, slow: number, fast: number, sig: number) {
  const a = ema(c, fast), b = ema(c, slow);
  const line = nanArray(c.length);
  for (let i = 0; i < c.length; i++) line[i] = a[i] - b[i];
  const signal = ema(line, sig);
  const hist = nanArray(c.length);
  for (let i = 0; i < c.length; i++) hist[i] = line[i] - signal[i];
  return { line, signal, hist };
}

function trueRange(s: Candles): Float64Array {
  const out = new Float64Array(s.c.length);
  for (let i = 0; i < out.length; i++) {
    out[i] = i === 0 ? s.h[0] - s.l[0] : Math.max(s.h[i] - s.l[i], Math.abs(s.h[i] - s.c[i - 1]), Math.abs(s.l[i] - s.c[i - 1]));
  }
  return out;
}

/** Wilder's directional movement: +DI, −DI and ADX. */
export function adx(s: Candles, n: number) {
  const len = s.c.length;
  const plus = new Float64Array(len), minus = new Float64Array(len);
  for (let i = 1; i < len; i++) {
    const up = s.h[i] - s.h[i - 1], dn = s.l[i - 1] - s.l[i];
    plus[i] = up > dn && up > 0 ? up : 0;
    minus[i] = dn > up && dn > 0 ? dn : 0;
  }
  const tr = trueRange(s);
  const sTr = wilder(tr, n, 1), sP = wilder(plus, n, 1), sM = wilder(minus, n, 1);
  const pos = nanArray(len), neg = nanArray(len), dx = nanArray(len);
  for (let i = 0; i < len; i++) {
    if (Number.isNaN(sTr[i]) || sTr[i] === 0) continue;
    pos[i] = (100 * sP[i]) / sTr[i];
    neg[i] = (100 * sM[i]) / sTr[i];
    const sum = pos[i] + neg[i];
    dx[i] = sum === 0 ? 0 : (100 * Math.abs(pos[i] - neg[i])) / sum;
  }
  let first = 0;
  while (first < len && Number.isNaN(dx[first])) first++;
  return { pos, neg, adx: wilder(dx, n, first) };
}

/** Bollinger bands: simple average ± k population standard deviations. */
export function bollinger(c: ArrayLike<number>, n: number, k: number) {
  const mid = sma(c, n);
  const upper = nanArray(c.length), lower = nanArray(c.length);
  for (let i = n - 1; i < c.length; i++) {
    if (Number.isNaN(mid[i])) continue;
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += (c[j] - mid[i]) ** 2;
    const d = Math.sqrt(s / n) * k;
    upper[i] = mid[i] + d;
    lower[i] = mid[i] - d;
  }
  return { upper, lower };
}

/** Highest of `hi` and lowest of `lo` over n candles ending at each candle. */
function channel(hi: ArrayLike<number>, lo: ArrayLike<number>, n: number) {
  const max = nanArray(hi.length), min = nanArray(hi.length);
  for (let i = n - 1; i < hi.length; i++) {
    let a = -Infinity, b = Infinity, bad = false;
    for (let j = i - n + 1; j <= i; j++) {
      if (Number.isNaN(hi[j]) || Number.isNaN(lo[j])) { bad = true; break; }
      if (hi[j] > a) a = hi[j];
      if (lo[j] < b) b = lo[j];
    }
    if (!bad) { max[i] = a; min[i] = b; }
  }
  return { max, min };
}

/** Stochastics: fast %K is the raw reading, fast %D its m-average; slow %K is fast %D, slow %D its m-average. */
export function stochastic(s: Candles, n: number, m: number) {
  const { max, min } = channel(s.h, s.l, n);
  const raw = nanArray(s.c.length);
  for (let i = 0; i < raw.length; i++) if (!Number.isNaN(max[i])) raw[i] = max[i] === min[i] ? 50 : (100 * (s.c[i] - min[i])) / (max[i] - min[i]);
  const fastD = sma(raw, m);
  return { fastK: raw, fastD, slowK: fastD, slowD: sma(fastD, m) };
}

/** Stochastic RSI on a 0–100 scale. */
export function stochRsi(c: ArrayLike<number>, n: number): Float64Array {
  const r = rsi(c, n);
  const { max, min } = channel(r, r, n);
  const out = nanArray(c.length);
  for (let i = 0; i < out.length; i++) if (!Number.isNaN(max[i])) out[i] = max[i] === min[i] ? 50 : (100 * (r[i] - min[i])) / (max[i] - min[i]);
  return out;
}

export function cci(s: Candles, n: number): Float64Array {
  const tp = new Float64Array(s.c.length);
  for (let i = 0; i < tp.length; i++) tp[i] = (s.h[i] + s.l[i] + s.c[i]) / 3;
  const m = sma(tp, n);
  const out = nanArray(tp.length);
  for (let i = n - 1; i < tp.length; i++) {
    let d = 0;
    for (let j = i - n + 1; j <= i; j++) d += Math.abs(tp[j] - m[i]);
    d /= n;
    if (d > 0) out[i] = (tp[i] - m[i]) / (0.015 * d);
  }
  return out;
}

export function mfi(s: Candles, n: number): Float64Array {
  const len = s.c.length;
  const tp = new Float64Array(len);
  for (let i = 0; i < len; i++) tp[i] = (s.h[i] + s.l[i] + s.c[i]) / 3;
  const out = nanArray(len);
  for (let i = n; i < len; i++) {
    let pos = 0, neg = 0;
    for (let j = i - n + 1; j <= i; j++) {
      const flow = tp[j] * s.v[j];
      if (tp[j] > tp[j - 1]) pos += flow; else if (tp[j] < tp[j - 1]) neg += flow;
    }
    out[i] = neg === 0 ? (pos === 0 ? 50 : 100) : 100 - 100 / (1 + pos / neg);
  }
  return out;
}

export function williamsR(s: Candles, n: number): Float64Array {
  const { max, min } = channel(s.h, s.l, n);
  const out = nanArray(s.c.length);
  for (let i = 0; i < out.length; i++) if (!Number.isNaN(max[i])) out[i] = max[i] === min[i] ? -50 : (-100 * (max[i] - s.c[i])) / (max[i] - min[i]);
  return out;
}

export function aroon(s: Candles, n: number) {
  const len = s.c.length;
  const up = nanArray(len), down = nanArray(len);
  for (let i = n; i < len; i++) {
    let hi = i, lo = i;
    for (let j = i - n; j <= i; j++) { if (s.h[j] >= s.h[hi]) hi = j; if (s.l[j] <= s.l[lo]) lo = j; }
    up[i] = (100 * (n - (i - hi))) / n;
    down[i] = (100 * (n - (i - lo))) / n;
  }
  return { up, down };
}

/** Parabolic SAR: acceleration starts at `start`, rises by `step`, capped at `max`. */
export function psar(s: Candles, start: number, step: number, max: number): Float64Array {
  const len = s.c.length;
  const out = nanArray(len);
  if (len < 2) return out;
  let long = s.c[1] >= s.c[0];
  let af = start, ep = long ? s.h[0] : s.l[0], sar = long ? s.l[0] : s.h[0];
  for (let i = 1; i < len; i++) {
    sar = sar + af * (ep - sar);
    if (long) {
      sar = Math.min(sar, s.l[i - 1], i > 1 ? s.l[i - 2] : s.l[i - 1]);
      if (s.l[i] < sar) { long = false; sar = ep; ep = s.l[i]; af = start; }
      else if (s.h[i] > ep) { ep = s.h[i]; af = Math.min(af + step, max); }
    } else {
      sar = Math.max(sar, s.h[i - 1], i > 1 ? s.h[i - 2] : s.h[i - 1]);
      if (s.h[i] > sar) { long = true; sar = ep; ep = s.h[i]; af = start; }
      else if (s.l[i] < ep) { ep = s.l[i]; af = Math.min(af + step, max); }
    }
    out[i] = sar;
  }
  return out;
}

/** Supertrend on (high + low) / 2 and Wilder's ATR. */
export function supertrend(s: Candles, n: number, k: number): Float64Array {
  const len = s.c.length;
  const atr = wilder(trueRange(s), n);
  const out = nanArray(len);
  let upper = NaN, lower = NaN, trendUp = true;
  for (let i = 0; i < len; i++) {
    if (Number.isNaN(atr[i])) continue;
    const mid = (s.h[i] + s.l[i]) / 2;
    const bu = mid + k * atr[i], bl = mid - k * atr[i];
    const pc = i > 0 ? s.c[i - 1] : s.c[i];
    upper = Number.isNaN(upper) || bu < upper || pc > upper ? bu : upper;
    lower = Number.isNaN(lower) || bl > lower || pc < lower ? bl : lower;
    if (trendUp && s.c[i] < lower) trendUp = false;
    else if (!trendUp && s.c[i] > upper) trendUp = true;
    out[i] = trendUp ? lower : upper;
  }
  return out;
}

/**
 * Ichimoku. The spans and cloud are read as a chart draws them on the candle: each is the value
 * worked out `base` candles earlier, so nothing looks into the future.
 */
export function ichimoku(s: Candles, conv: number, base: number, spanB: number) {
  const len = s.c.length;
  const mid = (n: number) => { const { max, min } = channel(s.h, s.l, n); const out = nanArray(len); for (let i = 0; i < len; i++) out[i] = (max[i] + min[i]) / 2; return out; };
  const c = mid(conv), b = mid(base), b2 = mid(spanB);
  const a = nanArray(len), sb = nanArray(len), top = nanArray(len), bottom = nanArray(len);
  for (let i = base; i < len; i++) {
    const j = i - base;
    a[i] = (c[j] + b[j]) / 2;
    sb[i] = b2[j];
    if (!Number.isNaN(a[i]) && !Number.isNaN(sb[i])) { top[i] = Math.max(a[i], sb[i]); bottom[i] = Math.min(a[i], sb[i]); }
  }
  return { conv: c, base: b, a, b: sb, top, bottom };
}

/** Volume-weighted average of the close over n candles. */
export function vwma(s: Candles, n: number): Float64Array {
  const out = nanArray(s.c.length);
  for (let i = n - 1; i < out.length; i++) {
    let pv = 0, v = 0;
    for (let j = i - n + 1; j <= i; j++) { pv += s.c[j] * s.v[j]; v += s.v[j]; }
    if (v > 0) out[i] = pv / v;
  }
  return out;
}

/** Session VWAP on intraday candles (t in unix seconds), restarting each India day. */
export function sessionVwap(s: Candles): Float64Array {
  const out = nanArray(s.c.length);
  let day = -1, pv = 0, v = 0;
  for (let i = 0; i < out.length; i++) {
    const d = Math.floor((Number(s.t[i]) + 19800) / 86400);
    if (d !== day) { day = d; pv = 0; v = 0; }
    pv += ((s.h[i] + s.l[i] + s.c[i]) / 3) * s.v[i];
    v += s.v[i];
    if (v > 0) out[i] = pv / v;
  }
  return out;
}

// ── Candle sizes ───────────────────────────────────────────────────

const fromRows = (rows: number[][]): Candles => ({
  t: rows.map((r) => r[0]),
  o: Float64Array.from(rows, (r) => r[1]), h: Float64Array.from(rows, (r) => r[2]), l: Float64Array.from(rows, (r) => r[3]),
  c: Float64Array.from(rows, (r) => r[4]), v: Float64Array.from(rows, (r) => r[5]),
});

function rollDaily(d: Candles, keyOf: (day: number) => number): Candles {
  const rows: number[][] = [];
  let open = -1;
  for (let i = 0; i < d.c.length; i++) {
    const day = Number(d.t[i]);
    const k = keyOf(day);
    const last = rows[rows.length - 1];
    if (k !== open || !last) { rows.push([day, d.o[i], d.h[i], d.l[i], d.c[i], d.v[i]]); open = k; }
    else {
      last[0] = day;
      if (d.h[i] > last[2]) last[2] = d.h[i];
      if (d.l[i] < last[3]) last[3] = d.l[i];
      last[4] = d.c[i];
      last[5] += d.v[i];
    }
  }
  return fromRows(rows);
}

/** Weekly candles, Monday to Friday. Day 0 (1 Jan 1970) was a Thursday, so day + 3 counts from a Monday. */
export const toWeekly = (d: Candles) => rollDaily(d, (day) => Math.floor((day + 3) / 7));

const monthOf = (day: number) => { const x = new Date(day * 86400_000); return x.getUTCFullYear() * 12 + x.getUTCMonth(); };
export const toMonthly = (d: Candles) => rollDaily(d, monthOf);

/** Monthly candles from older months plus the months the daily candles cover. */
export function monthlyFrom(older: Candles | null, d: Candles): Candles {
  const recent = toMonthly(d);
  if (!older || older.c.length === 0) return recent;
  const firstMonth = recent.c.length ? monthOf(Number(recent.t[0])) : Infinity;
  const keep: number[] = [];
  for (let i = 0; i < older.c.length; i++) if (monthOf(Number(older.t[i])) < firstMonth) keep.push(i);
  const pick = (a: Float64Array, b: Float64Array) => { const out = new Float64Array(keep.length + b.length); keep.forEach((k, i) => (out[i] = a[k])); out.set(b, keep.length); return out; };
  return {
    t: [...keep.map((k) => Number(older.t[k])), ...Array.from(recent.t, Number)],
    o: pick(older.o, recent.o), h: pick(older.h, recent.h), l: pick(older.l, recent.l), c: pick(older.c, recent.c), v: pick(older.v, recent.v),
  };
}

/** Longer intraday candles from 5-minute ones, counted from the 09:15 open as the exchange's own are. */
export function rollMinutes(m: Candles, minutes: number): Candles {
  const rows: number[][] = [];
  let open = -1;
  for (let i = 0; i < m.c.length; i++) {
    const t = Number(m.t[i]);
    const local = t + 19800;
    const day = Math.floor(local / 86400);
    const fromOpen = Math.floor((local % 86400) / 60) - 555;
    const k = day * 10000 + Math.floor(Math.max(0, fromOpen) / minutes);
    const last = rows[rows.length - 1];
    if (k !== open || !last) { rows.push([t, m.o[i], m.h[i], m.l[i], m.c[i], m.v[i]]); open = k; }
    else {
      if (m.h[i] > last[2]) last[2] = m.h[i];
      if (m.l[i] < last[3]) last[3] = m.l[i];
      last[4] = m.c[i];
      last[5] += m.v[i];
    }
  }
  return fromRows(rows);
}
