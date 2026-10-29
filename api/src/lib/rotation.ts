// Sector rotation maths: four "lenses" that place each sector on a 100-centred
// plane (x, y) against a benchmark, so one four-quadrant map, one crosshair at
// (100, 100) and one zoom range work for every lens.
//
//   classic  Relative strength vs its momentum (the JdK-style rotation map)
//   trend    Trend quality (regression t-statistic) vs trend acceleration
//   risk     Downside-adjusted alpha (relative Sortino) vs short-term alpha momentum
//   volume   Volume-backed relative strength vs relative volume (participation)
//
// Everything is put on a 100-centred scale, value = 100 + 2·z:
//   classic  z is the rotation map's own convention: each series against its own last
//            `z` periods (relative strength above or below its own recent range)
//   others   z is measured across the sectors on the same date (100 = the average
//            sector, +2 = one standard deviation better), because a t-statistic, a
//            Sortino ratio or relative volume already carries meaning in absolute terms.
// Pure functions, no I/O.

export type Bar = { date: string; open: number | null; high: number | null; low: number | null; close: number; volume: number | null };
export type Timeframe = "weekly" | "daily";
export type LensKey = "classic" | "trend" | "risk" | "volume";
export type SizeBy = "uniform" | "rvol" | "volatility" | "velocity";
export type Quadrant = "tr" | "br" | "bl" | "tl";

type Params = { long: number; short: number; z: number; smooth: number; lag: number; volShort: number; volLong: number; atr: number };
export const PARAMS: Record<Timeframe, Params> = {
  daily: { long: 60, short: 20, z: 100, smooth: 10, lag: 5, volShort: 10, volLong: 50, atr: 14 },
  weekly: { long: 60, short: 20, z: 52, smooth: 4, lag: 2, volShort: 4, volLong: 26, atr: 14 },
};
/** Periods of history a lens needs before its newest point (and 8-point tail) is valid. */
export const minHistory = (lens: LensKey, tf: Timeframe) => {
  const p = PARAMS[tf];
  const first = lens === "classic" ? p.smooth + p.lag + 2 * p.z : lens === "volume" ? p.volLong + p.long : p.long + 1;
  return first + 8;
};

export type LensInfo = {
  key: LensKey; label: string; x: string; y: string; xShort: string; yShort: string; xMath: string; yMath: string;
  quadrants: Record<Quadrant, string>;
};

export const LENSES: Record<LensKey, LensInfo> = {
  classic: {
    key: "classic", label: "Classic rotation", x: "Relative strength (RS-Ratio)", y: "RS-Momentum", xShort: "RS", yShort: "Mom.",
    xMath: "How strong the sector is against the benchmark: its smoothed price ratio, scored against its own recent range (100 = typical).",
    yMath: "How fast that relative strength is changing: the recent change in the RS score, scored the same way.",
    quadrants: { tr: "Leading", br: "Weakening", bl: "Lagging", tl: "Improving" },
  },
  trend: {
    key: "trend", label: "Trend quality", x: "Trend quality (t-stat)", y: "Trend acceleration", xShort: "Quality", yShort: "Accel.",
    xMath: "How smooth and consistent the sector's relative uptrend is: the t-statistic of a 60-period regression of ln(sector ÷ benchmark), so choppy spikes score low.",
    yMath: "Whether the trend is speeding up: the 20-period regression slope minus the 60-period slope.",
    quadrants: { tr: "High-conviction compounding", br: "Trend exhaustion", bl: "Structural breakdown", tl: "Mean reversion / early turn" },
  },
  risk: {
    key: "risk", label: "Risk-adjusted alpha", x: "Risk-adjusted RS (Sortino)", y: "Alpha momentum", xShort: "Sortino", yShort: "Mom.",
    xMath: "Excess return over the benchmark per unit of downside volatility (60-period relative Sortino ratio): rewards upside, penalises drops.",
    yMath: "Whether risk-adjusted alpha is improving: the 20-period relative Sortino minus the 60-period one.",
    quadrants: { tr: "Low-risk breakout", br: "Coiling / consolidation", bl: "High-beta bleed", tl: "Speculative rebound" },
  },
  volume: {
    key: "volume", label: "Volume & participation", x: "Volume-backed RS", y: "Relative volume (RVOL)", xShort: "VW-RS", yShort: "RVOL",
    xMath: "Relative strength that heavy trading backs up: the sector's excess return over the benchmark, weighted by each period's relative volume over 60 periods.",
    yMath: "Participation right now: the short-term average volume against its longer average (e.g. 10 days vs 50 days).",
    quadrants: { tr: "Broad accumulation", br: "Narrow / low-volume drift", bl: "Broad capitulation", tl: "Smart-money bottoming" },
  },
};

// ── Building blocks ────────────────────────────────────────────────

const NAN = Number.NaN;
const ok = (v: number) => Number.isFinite(v);

/** Group bars into weeks (Monday start): last close, week's high/low, summed volume, dated by the last trading day. */
export function resample(bars: Bar[], tf: Timeframe): Bar[] {
  if (tf === "daily") return bars;
  const weeks = new Map<string, Bar>();
  for (const b of bars) {
    const d = new Date(`${b.date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const k = d.toISOString().slice(0, 10);
    const w = weeks.get(k);
    if (!w) weeks.set(k, { ...b });
    else {
      w.date = b.date;
      w.close = b.close;
      w.high = w.high == null ? b.high : b.high == null ? w.high : Math.max(w.high, b.high);
      w.low = w.low == null ? b.low : b.low == null ? w.low : Math.min(w.low, b.low);
      w.volume = w.volume == null && b.volume == null ? null : (w.volume ?? 0) + (b.volume ?? 0);
    }
  }
  return [...weeks.values()];
}

/** Dates both series share, as two aligned bar lists. */
export function align(a: Bar[], b: Bar[]): [Bar[], Bar[]] {
  const bm = new Map(b.map((x) => [x.date, x]));
  const outA: Bar[] = [], outB: Bar[] = [];
  for (const x of a) {
    const y = bm.get(x.date);
    if (y) { outA.push(x); outB.push(y); }
  }
  return [outA, outB];
}

export function sma(a: number[], n: number): number[] {
  const out = new Array<number>(a.length).fill(NAN);
  let sum = 0, cnt = 0;
  for (let i = 0; i < a.length; i++) {
    if (ok(a[i])) { sum += a[i]; cnt++; }
    if (i >= n && ok(a[i - n])) { sum -= a[i - n]; cnt--; }
    if (i >= n - 1 && cnt === n) out[i] = sum / n;
  }
  return out;
}

/** 100 + 2·z, with z against the series' own last `w` valid values. */
export function zNorm(a: number[], w: number): number[] {
  const out = new Array<number>(a.length).fill(NAN);
  for (let i = w - 1; i < a.length; i++) {
    let sum = 0, n = 0;
    for (let j = i - w + 1; j <= i; j++) if (ok(a[j])) { sum += a[j]; n++; }
    if (n < w) continue;
    const mean = sum / n;
    let ss = 0;
    for (let j = i - w + 1; j <= i; j++) ss += (a[j] - mean) ** 2;
    const sd = Math.sqrt(ss / (n - 1));
    out[i] = sd > 0 ? 100 + 2 * ((a[i] - mean) / sd) : 100;
  }
  return out;
}

/** Rolling OLS of y on 0..L-1: slope per period and its t-statistic. */
export function regression(y: number[], L: number): { slope: number[]; t: number[] } {
  const slope = new Array<number>(y.length).fill(NAN), t = new Array<number>(y.length).fill(NAN);
  const sxx = (L * (L * L - 1)) / 12, xm = (L - 1) / 2;
  for (let i = L - 1; i < y.length; i++) {
    let ym = 0;
    for (let k = 0; k < L; k++) ym += y[i - L + 1 + k];
    ym /= L;
    let sxy = 0, syy = 0;
    for (let k = 0; k < L; k++) {
      const dy = y[i - L + 1 + k] - ym;
      sxy += (k - xm) * dy;
      syy += dy * dy;
    }
    const b = sxy / sxx;
    slope[i] = b;
    const rss = Math.max(syy - b * b * sxx, 0);
    const se = Math.sqrt(rss / (L - 2) / sxx);
    // A perfectly straight line has no error: cap its t-stat instead of dividing by zero.
    t[i] = se > 1e-12 ? b / se : b === 0 ? 0 : Math.sign(b) * 1000;
  }
  return { slope, t };
}

/** Rolling Sortino of a return series: mean ÷ downside deviation (floored so a run of gains stays finite). */
export function sortino(r: number[], L: number): number[] {
  const out = new Array<number>(r.length).fill(NAN);
  for (let i = L; i < r.length; i++) {
    let sum = 0, dd = 0;
    for (let k = i - L + 1; k <= i; k++) { sum += r[k]; dd += Math.min(r[k], 0) ** 2; }
    out[i] = sum / L / Math.max(Math.sqrt(dd / L), 1e-5);
  }
  return out;
}

const diff = (a: number[], lag: number) => a.map((v, i) => (i >= lag ? v - a[i - lag] : NAN));
const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]);

// ── Lenses ─────────────────────────────────────────────────────────

/**
 * x and y series for one sector against the benchmark (both date-aligned). Classic comes back
 * already on the 100-centred scale; the other lenses come back raw and are normalised across
 * sectors by `crossSection`.
 */
export function computeLens(lens: LensKey, s: Bar[], b: Bar[], tf: Timeframe): { x: number[]; y: number[] } {
  const p = PARAMS[tf];
  const rs = s.map((bar, i) => bar.close / b[i].close);
  const lrs = rs.map(Math.log);
  const r = lrs.map((v, i) => (i ? v - lrs[i - 1] : NAN)); // relative log return per period
  const vol = s.map((bar) => (bar.volume != null && bar.volume > 0 ? bar.volume : NAN));

  if (lens === "classic") {
    const x = zNorm(sma(rs, p.smooth), p.z);
    return { x, y: zNorm(diff(x, p.lag), p.z) };
  }
  if (lens === "trend") {
    const long = regression(lrs, p.long), short = regression(lrs, p.short);
    return { x: long.t, y: sub(short.slope, long.slope) };
  }
  if (lens === "risk") {
    const long = sortino(r, p.long), short = sortino(r, p.short);
    return { x: long, y: sub(short, long) };
  }
  // volume: relative return weighted by relative volume; and short vs long average volume
  const avgLong = sma(vol, p.volLong), avgShort = sma(vol, p.volShort);
  const rv = vol.map((v, i) => v / avgLong[i]);
  const vw = r.map((_, i) => {
    if (i < p.long) return NAN;
    let num = 0, den = 0;
    for (let k = i - p.long + 1; k <= i; k++) {
      if (!ok(rv[k]) || !ok(r[k])) return NAN;
      num += r[k] * rv[k];
      den += rv[k];
    }
    return den > 0 ? num / den : NAN;
  });
  return { x: vw, y: avgShort.map((v, i) => Math.log(v / avgLong[i])) };
}

/** Rewrites the last `k` values of each sector's x and y as 100 + 2·z across the sectors on that date (others become NaN). */
export function crossSection(all: { dates: string[]; x: number[]; y: number[] }[], k: number): void {
  const lastDates = all.reduce((best, s) => (s.dates.length > best.length ? s.dates : best), [] as string[]).slice(-k);
  for (const axis of ["x", "y"] as const) {
    for (const d of lastDates) {
      const at = all.map((s) => ({ s, i: s.dates.indexOf(d) })).filter(({ s, i }) => i >= 0 && ok(s[axis][i]));
      const vals = at.map(({ s, i }) => s[axis][i]);
      const mean = vals.reduce((a, v) => a + v, 0) / (vals.length || 1);
      const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / Math.max(vals.length - 1, 1));
      for (const { s, i } of at) s[axis][i] = vals.length >= 3 && sd > 0 ? 100 + 2 * ((s[axis][i] - mean) / sd) : 100;
    }
    // Outside those dates the cross-section isn't computed.
    for (const s of all) for (let i = 0; i < s.dates.length - 0; i++) if (!lastDates.includes(s.dates[i])) s[axis][i] = NAN;
  }
}

export const quadrantOf = (x: number, y: number): Quadrant => (x >= 100 ? (y >= 100 ? "tr" : "br") : y >= 100 ? "tl" : "bl");

/** Average true range as % of price at the last period. */
export function atrPercent(bars: Bar[], n: number): number | null {
  if (bars.length <= n) return null;
  let sum = 0;
  for (let i = bars.length - n; i < bars.length; i++) {
    const { high, low } = bars[i], prev = bars[i - 1].close;
    if (high == null || low == null) return null;
    sum += Math.max(high - low, Math.abs(high - prev), Math.abs(low - prev));
  }
  const last = bars[bars.length - 1].close;
  return last ? Math.round((sum / n / last) * 10000) / 100 : null;
}

export type SectorPoint = {
  x: number; y: number; dx: number; dy: number; quadrant: Quadrant;
  tail: { date: string; x: number; y: number }[];
  rvol: number | null; volatility: number | null; velocity: number;
};

/** One sector's position from prepared series (see `sectorSeries`); null when its tail isn't complete. */
export function sectorPoint(series: { bars: Bar[]; x: number[]; y: number[]; dates: string[] }, tf: Timeframe, tailLength = 8, deltaPeriods = 4): SectorPoint | null {
  const { bars: s, x, y } = series;
  const last = s.length - 1;
  const need = Math.max(tailLength - 1, deltaPeriods);
  for (let k = 0; k <= need; k++) if (!ok(x[last - k]) || !ok(y[last - k])) return null;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const tail = Array.from({ length: tailLength }, (_, k) => last - (tailLength - 1) + k).map((i) => ({ date: s[i].date, x: r2(x[i]), y: r2(y[i]) }));
  let velocity = 0;
  for (let k = 0; k < deltaPeriods; k++) velocity += Math.hypot(x[last - k] - x[last - k - 1], y[last - k] - y[last - k - 1]);
  const p = PARAMS[tf];
  const vol = s.map((bar) => bar.volume ?? NAN);
  const rvol = sma(vol, p.volShort)[last] / sma(vol, p.volLong)[last];
  return {
    x: r2(x[last]), y: r2(y[last]),
    dx: r2(x[last] - x[last - deltaPeriods]), dy: r2(y[last] - y[last - deltaPeriods]),
    quadrant: quadrantOf(x[last], y[last]), tail,
    rvol: ok(rvol) ? r2(rvol) : null, volatility: atrPercent(s, p.atr), velocity: r2(velocity),
  };
}

// ── Sectors ────────────────────────────────────────────────────────

/** The NSE sector and theme indices the map shows, and the label each gets. */
export const SECTOR_INDICES: Record<string, string> = {
  "Nifty IT": "IT", "Nifty Media": "Media", "Nifty Private Bank": "Private Bank", "Nifty FMCG": "FMCG",
  "Nifty Financial Services": "Fin Services", "Nifty Bank": "Bank", "Nifty PSU Bank": "PSU Bank", "Nifty Oil & Gas": "Oil & Gas",
  "Nifty Capital Markets": "Cap Markets", "Nifty Pharma": "Pharma", "Nifty Healthcare Index": "Health", "Nifty Cement": "Cement",
  "Nifty Infrastructure": "Infra", "Nifty CPSE": "CPSE", "Nifty India Consumption": "Consumption", "Nifty PSE": "PSE",
  "Nifty Energy": "Energy", "Nifty Commodities": "Commodity", "Nifty Realty": "Realty", "Nifty Chemicals": "Chemicals",
  "Nifty MNC": "MNC", "Nifty Auto": "Auto", "Nifty India Defence": "Defence", "Nifty Consumer Durables": "Consumer Durables", "Nifty Metal": "Metal",
};
export const BENCHMARKS: Record<string, { name: string; label: string }> = {
  nifty50: { name: "Nifty 50", label: "Nifty 50" },
  nifty500: { name: "Nifty 500", label: "Nifty 500" },
};

export const QUADRANT_ORDER: Quadrant[] = ["tr", "br", "tl", "bl"];

export type MatrixSector = { key: string; name: string; index: string; size: number } & SectorPoint;
export type Matrix = {
  as_of: string | null; lens: LensInfo; benchmark: { key: string; name: string }; timeframe: Timeframe; period: string;
  size_by: SizeBy; sectors: MatrixSector[]; skipped: string[]; counts: Record<Quadrant, number>;
};

/** Bubble size value for one sector under the chosen encoding (null = uniform). */
const sizeValue = (p: SectorPoint, by: SizeBy) => (by === "rvol" ? p.rvol : by === "volatility" ? p.volatility : by === "velocity" ? p.velocity : null);

export function buildMatrix(
  barsByIndex: Map<string, Bar[]>, lens: LensKey, benchmark: string, tf: Timeframe, sizeBy: SizeBy,
): Matrix {
  const bm = BENCHMARKS[benchmark] ?? BENCHMARKS.nifty50;
  const bench = resample(barsByIndex.get(bm.name) ?? [], tf);
  const skipped: string[] = [];
  const prepared: { key: string; name: string; index: string; series: { bars: Bar[]; x: number[]; y: number[]; dates: string[] } }[] = [];
  for (const [index, name] of Object.entries(SECTOR_INDICES)) {
    const bars = barsByIndex.get(index);
    if (!bars || !bench.length) { skipped.push(name); continue; }
    const [s, b] = align(resample(bars, tf), bench);
    if (s.length < minHistory(lens, tf)) { skipped.push(name); continue; }
    const { x, y } = computeLens(lens, s, b, tf);
    prepared.push({ key: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name, index, series: { bars: s, x, y, dates: s.map((bar) => bar.date) } });
  }
  if (lens !== "classic") crossSection(prepared.map((p) => p.series), 8);

  const raw: { key: string; name: string; index: string; point: SectorPoint }[] = [];
  for (const p of prepared) {
    const point = sectorPoint(p.series, tf);
    if (point) raw.push({ key: p.key, name: p.name, index: p.index, point });
    else skipped.push(p.name);
  }
  // Bubble radius 0..1 across the sectors shown (min-max), so the chart maps it to 4–12 px.
  const vals = raw.map((r) => sizeValue(r.point, sizeBy)).filter((v): v is number => v != null);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const sectors: MatrixSector[] = raw.map((r) => {
    const v = sizeValue(r.point, sizeBy);
    return { key: r.key, name: r.name, index: r.index, ...r.point, size: v == null || !vals.length ? 0.5 : hi > lo ? Math.round(((v - lo) / (hi - lo)) * 100) / 100 : 0.5 };
  });
  const counts = { tr: 0, br: 0, bl: 0, tl: 0 } as Record<Quadrant, number>;
  for (const s of sectors) counts[s.quadrant]++;
  return {
    as_of: bench.length ? bench[bench.length - 1].date : null, lens: LENSES[lens], benchmark: { key: benchmark in BENCHMARKS ? benchmark : "nifty50", name: bm.name },
    timeframe: tf, period: tf === "weekly" ? "week" : "day", size_by: sizeBy, sectors, skipped, counts,
  };
}

/** The matrix as markdown, for people and for LLMs reading it as context. */
export function matrixMarkdown(m: Matrix): string {
  const f = (v: number) => v.toFixed(2);
  const sg = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}`;
  const lines = [
    `# Sector Rotation Map`,
    ``,
    `- **Lens:** ${m.lens.label}`,
    `- **X axis:** ${m.lens.x}: ${m.lens.xMath}`,
    `- **Y axis:** ${m.lens.y}: ${m.lens.yMath}`,
    `- **Benchmark:** ${m.benchmark.name}`,
    `- **Timeframe:** ${m.timeframe === "weekly" ? "Weekly" : "Daily"} (tail = last 8 ${m.period}s, change = last 4 ${m.period}s)`,
    `- **As of:** ${m.as_of ?? "n/a"}`,
    `- **Scale:** every metric is normalised to 100 (typical) with 2 points per standard deviation; quadrants split at (100, 100).`,
    ``,
    `| Sector | ${m.lens.xShort} (X) | ${m.lens.yShort} (Y) | ΔX (4${m.period[0]}) | ΔY (4${m.period[0]}) | Quadrant |`,
    `|---|---:|---:|---:|---:|---|`,
  ];
  for (const q of QUADRANT_ORDER) {
    for (const s of m.sectors.filter((x) => x.quadrant === q).sort((a, b) => b.x + b.y - (a.x + a.y))) {
      lines.push(`| ${s.name} | ${f(s.x)} | ${f(s.y)} | ${sg(s.dx)} | ${sg(s.dy)} | ${m.lens.quadrants[q]} |`);
    }
  }
  lines.push(``, `Quadrants: ${QUADRANT_ORDER.map((q) => `${m.lens.quadrants[q]} (${m.counts[q]})`).join(", ")}.`);
  if (m.skipped.length) lines.push(``, `No data yet for: ${m.skipped.join(", ")}.`);
  return lines.join("\n");
}
