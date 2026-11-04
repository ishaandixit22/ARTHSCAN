// Runs a compiled rule against one stock. A value we don't have is null, and any comparison with
// a null is false: a stock never passes a test on a figure we couldn't work out.

import { adx, aroon, bollinger, type Candles, cci, ema, ichimoku, macd, mfi, monthlyFrom, psar, rollMinutes, rsi, sessionVwap, sma, stochastic, stochRsi, supertrend, toWeekly, vwma, williamsR, wma } from "./calc.js";
import type { Node, Tf } from "./rules.js";

/** Annual figures for yearly rules, newest year first. */
export type YearSeries = Record<string, (number | null)[]>;
export type StockFund = Record<string, number | null>;

export type StockData = {
  symbol: string;
  daily: Candles;
  /** Months older than the daily candles reach. */
  monthlyOlder?: Candles | null;
  /** Highest and lowest prices before the daily candles begin. */
  ath?: number | null;
  atl?: number | null;
  /** 5-minute candles, for intraday rules. */
  minutes?: Candles | null;
  /** Latest time a higher intraday candle may end (unix seconds): only finished candles count. */
  cutoff?: number;
  fund?: StockFund | null;
  years?: YearSeries | null;
  /** Financial year-end EPS with the year's last month, for historical P/E. */
  fyEps?: { month: string; eps: number | null }[] | null;
};

const pick = (series: Float64Array | number[], off: number): number | null => {
  const v = series[series.length - 1 - off];
  return v === undefined || Number.isNaN(v) ? null : v;
};

export class StockContext {
  private sizes = new Map<string, Candles>();
  private memo = new Map<string, Float64Array>();
  constructor(readonly s: StockData) {}

  candles(tf: Tf): Candles | null {
    const key = String(tf);
    const hit = this.sizes.get(key);
    if (hit) return hit;
    let out: Candles | null = null;
    if (tf === "d") out = this.s.daily;
    else if (tf === "w") out = toWeekly(this.s.daily);
    else if (tf === "m") out = monthlyFrom(this.s.monthlyOlder ?? null, this.s.daily);
    else if (typeof tf === "number" && this.s.minutes) {
      out = tf === 5 ? this.s.minutes : rollMinutes(this.s.minutes, tf);
      // A bigger candle counts only once it has finished.
      if (tf !== 5 && this.s.cutoff && out.c.length && Number(out.t[out.c.length - 1]) + tf * 60 > this.s.cutoff) {
        const n = out.c.length - 1;
        out = { t: Array.from(out.t).slice(0, n), o: out.o.slice(0, n), h: out.h.slice(0, n), l: out.l.slice(0, n), c: out.c.slice(0, n), v: out.v.slice(0, n) };
      }
    }
    if (out) this.sizes.set(key, out);
    return out;
  }

  private indicator(tf: Tf, name: string, args: (number | string)[]): Float64Array | null {
    const key = `${tf}|${name}|${args.join(",")}`;
    const hit = this.memo.get(key);
    if (hit) return hit;
    const s = this.candles(tf);
    if (!s) return null;
    const base = (f: unknown) => (f === "open" ? s.o : f === "high" ? s.h : f === "low" ? s.l : f === "volume" ? s.v : s.c);
    const a = args as number[];
    const put = (x: Float64Array) => { this.memo.set(key, x); return x; };
    const group = (prefix: string, vals: Record<string, Float64Array>) => {
      for (const [n, v] of Object.entries(vals)) this.memo.set(`${tf}|${prefix}${n}|${args.join(",")}`, v);
      return this.memo.get(key) ?? null;
    };
    switch (name) {
      case "open": return s.o;
      case "high": return s.h;
      case "low": return s.l;
      case "close": return s.c;
      case "volume": return s.v;
      case "sma": case "ema": case "wma": {
        const [f, n] = args.length === 2 ? args : ["close", args[0]];
        return put((name === "sma" ? sma : name === "ema" ? ema : wma)(base(f), Number(n)));
      }
      case "rsi": return put(rsi(s.c, a[0]));
      case "macd_line": case "macd_signal": case "macd_histogram": {
        const m = macd(s.c, a[0], a[1], a[2]);
        return group("macd_", { line: m.line, signal: m.signal, histogram: m.hist });
      }
      case "adx": case "adx_di_positive": case "adx_di_negative": {
        const x = adx(s, a[0]);
        this.memo.set(`${tf}|adx|${args}`, x.adx);
        return group("adx_di_", { positive: x.pos, negative: x.neg });
      }
      case "upper_bollinger_band": case "lower_bollinger_band": {
        const b = bollinger(s.c, a[0], a[1]);
        this.memo.set(`${tf}|upper_bollinger_band|${args}`, b.upper);
        this.memo.set(`${tf}|lower_bollinger_band|${args}`, b.lower);
        return this.memo.get(key)!;
      }
      case "slow_stochastic_%k": case "slow_stochastic_%d": case "fast_stochastic_%k": case "fast_stochastic_%d": {
        const x = stochastic(s, a[0], a[1]);
        return group("", { "slow_stochastic_%k": x.slowK, "slow_stochastic_%d": x.slowD, "fast_stochastic_%k": x.fastK, "fast_stochastic_%d": x.fastD });
      }
      case "stochrsi": return put(stochRsi(s.c, a[0]));
      case "cci": return put(cci(s, a[0]));
      case "mfi": return put(mfi(s, a[0]));
      case "williams_%r": return put(williamsR(s, a[0]));
      case "aroon_up": case "aroon_down": {
        const x = aroon(s, a[0]);
        return group("aroon_", { up: x.up, down: x.down });
      }
      case "parabolic_sar": return put(psar(s, a[0], a[1], a[2]));
      case "supertrend": return put(supertrend(s, a[0], a[1]));
      case "ichimoku_conversion_line": case "ichimoku_base_line": case "ichimoku_span_a": case "ichimoku_span_b": case "ichimoku_cloud_top": case "ichimoku_cloud_bottom": {
        const x = ichimoku(s, a[0], a[1], a[2]);
        return group("ichimoku_", { conversion_line: x.conv, base_line: x.base, span_a: x.a, span_b: x.b, cloud_top: x.top, cloud_bottom: x.bottom });
      }
      case "vwma": return put(vwma(s, a[0]));
      case "vwap": return put(sessionVwap(s));
      default: throw new Error(`Unknown indicator ${name}`);
    }
  }

  private price(): number | null {
    return pick(this.s.daily.c, 0);
  }

  private windowExtreme(values: Float64Array, n: number, high: boolean, off = 0): number | null {
    const end = values.length - 1 - off;
    if (end < 0) return null;
    let best: number | null = null;
    for (let i = Math.max(0, end - n + 1); i <= end; i++) if (!Number.isNaN(values[i]) && (best === null || (high ? values[i] > best : values[i] < best))) best = values[i];
    return best;
  }

  /** Named price figures. The 52-week range uses each day's high and low. */
  private calc(key: string): number | null {
    const d = this.s.daily, p = this.price();
    if (p === null) return null;
    const hi = () => this.windowExtreme(d.h, 252, true);
    const lo = () => this.windowExtreme(d.l, 252, false);
    const ret = (back: number) => { const b = pick(d.c, back); return b ? (p / b - 1) * 100 : null; };
    switch (key) {
      case "ret_1d": return ret(1);
      case "ret_1w": return ret(5);
      case "ret_1m": return ret(21);
      case "high_52w": return hi();
      case "low_52w": return lo();
      // Without a stock's full history the highest and lowest prices can't be known, so these stay empty.
      case "ath": { const h = this.windowExtreme(d.h, d.h.length, true); return h === null || this.s.ath == null ? null : Math.max(h, this.s.ath); }
      case "atl": { const l = this.windowExtreme(d.l, d.l.length, false); return l === null || this.s.atl == null ? null : Math.min(l, this.s.atl); }
      case "down_52w": { const h = hi(); return h ? (1 - p / h) * 100 : null; }
      case "up_52w": { const l = lo(); return l ? (p / l - 1) * 100 : null; }
      case "from_52w": { const h = hi(); return h ? p / h : null; }
      case "index_52w": { const h = hi(), l = lo(); return h !== null && l !== null && h > l ? ((p - l) / (h - l)) * 100 : null; }
      default: throw new Error(`Unknown calculation ${key}`);
    }
  }

  /** Company figures that move with the price are worked out here, at the price this run is using. */
  private fundValue(key: string, off = 0): number | null {
    const f = this.s.fund;
    if (key.startsWith("y_")) return key === "y_debt_zero" ? 0 : this.s.years?.[key.slice(2)]?.[off] ?? null;
    if (!f) return null;
    const stored = f[key];
    const p = this.price();
    const num = (v: number | null | undefined) => (v === undefined || v === null || Number.isNaN(v) ? null : v);
    const shares = num(f.shares);
    const mcap = p !== null && shares !== null ? p * shares : null;
    const by = (a: number | null, b: number | null) => (a === null || b === null || b === 0 ? null : a / b);
    switch (key) {
      case "mcap": return mcap;
      case "pe": return by(mcap, num(f.np));
      case "pb": return by(p, num(f.bv));
      case "peg": { const pe = by(mcap, num(f.np)); const g = num(f.np_g3); return pe !== null && pe > 0 && g !== null && g > 0 ? pe / g : null; }
      case "pcf": return by(mcap, num(f.cfo_fy));
      case "pfcf": return by(mcap, num(f.fcf_fy));
      case "mcap_sales": return by(mcap, num(f.sales));
      case "div_yield": { const d = num(f.div_fy); return mcap && d !== null ? (d / mcap) * 100 : null; }
      case "earnings_yield": { const ev = this.ev(mcap); const e = num(f.ebit); return ev && ev > 0 && e !== null ? (e / ev) * 100 : null; }
      case "ev_ebitda": { const ev = this.ev(mcap); return by(ev, num(f.ebitda)); }
      case "graham": { const e = num(f.eps), b = num(f.bv); return e !== null && b !== null && e > 0 && b > 0 ? Math.sqrt(22.5 * e * b) : null; }
      case "hist_pe_5": return this.historicalPe(5);
      default: return num(stored);
    }
  }

  private ev(mcap: number | null): number | null {
    const debt = this.s.fund?.debt, cash = this.s.fund?.cash;
    return mcap === null || debt == null || cash == null ? null : mcap + debt - cash;
  }

  /** Average year-end P/E: the close in each financial year's last month over that year's EPS. */
  private historicalPe(years: number): number | null {
    const rows = this.s.fyEps;
    const m = this.candles("m");
    if (!rows || !m || rows.length < years) return null;
    const closeIn = new Map<string, number>();
    for (let i = 0; i < m.c.length; i++) closeIn.set(new Date(Number(m.t[i]) * 86400_000).toISOString().slice(0, 7), m.c[i]);
    let sum = 0;
    for (const r of rows.slice(0, years)) {
      const c = closeIn.get(r.month);
      if (!c || r.eps === null || r.eps <= 0) return null;
      sum += c / r.eps;
    }
    return sum / years;
  }

  value(n: Node, shift = 0): number | null {
    switch (n.k) {
      case "num": return n.v;
      case "math": {
        const a = this.value(n.a, shift), b = this.value(n.b, shift);
        if (a === null || b === null) return null;
        if (n.op === "+") return a + b;
        if (n.op === "-") return a - b;
        if (n.op === "*") return a * b;
        return b === 0 ? null : a / b;
      }
      case "fn": {
        const xs = n.args.map((x) => this.value(x, shift));
        if (xs.some((x) => x === null)) return null;
        const v = xs as number[];
        return n.fn === "abs" ? Math.abs(v[0]) : n.fn === "least" ? Math.min(...v) : Math.max(...v);
      }
      case "fund": return this.fundValue(n.key, (n.off ?? 0) + shift);
      case "calc": return this.calc(n.key);
      case "ind": {
        const series = this.indicator(n.tf, n.ind, n.args);
        return series ? pick(series, n.off + shift) : null;
      }
      case "win": {
        if (n.fn === "count") {
          let hits = 0;
          for (let i = 0; i < n.n; i++) {
            const v = this.test(n.expr, n.off + shift + i);
            if (v) hits++;
          }
          return hits;
        }
        let best: number | null = null;
        for (let i = 0; i < n.n; i++) {
          const v = this.value(n.expr, n.off + shift + i);
          if (v === null) return null;
          if (best === null || (n.fn === "max" ? v > best : v < best)) best = v;
        }
        return best;
      }
      case "cmp": case "and": case "or": return this.test(n, shift) ? 1 : 0;
    }
  }

  test(n: Node, shift = 0): boolean {
    switch (n.k) {
      case "and": return n.xs.every((x) => this.test(x, shift));
      case "or": return n.xs.some((x) => this.test(x, shift));
      case "cmp": {
        const a = this.value(n.a, shift), b = this.value(n.b, shift);
        if (a === null || b === null) return false;
        switch (n.op) {
          case ">": return a > b;
          case ">=": return a >= b;
          case "<": return a < b;
          case "<=": return a <= b;
          case "=": return a === b;
          case "!=": return a !== b;
        }
      }
      // eslint-disable-next-line no-fallthrough
      default: return (this.value(n, shift) ?? 0) !== 0;
    }
  }
}

/** Whether a stock holds every figure a rule reads. Tells "nothing passed" apart from "nothing could be tested". */
export function hasFigures(ctx: StockContext, n: Node): boolean {
  switch (n.k) {
    case "num": return true;
    case "fund": case "calc": case "ind": return ctx.value(n) !== null;
    case "math": case "cmp": return hasFigures(ctx, n.a) && hasFigures(ctx, n.b);
    case "fn": return n.args.every((x) => hasFigures(ctx, x));
    case "win": return hasFigures(ctx, n.expr);
    case "and": return n.xs.every((x) => hasFigures(ctx, x));
    case "or": return n.xs.some((x) => hasFigures(ctx, x));
  }
}
