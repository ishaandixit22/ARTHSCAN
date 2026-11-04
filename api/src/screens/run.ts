// Running screens: company figures for every stock, the current session's prices, and the three ways
// a result is produced. Weekly and intraday results are stored; live ones are worked out on the click.

import type { Env } from "../env.js";
import { dhanPost } from "../lib/dhan.js";
import { marketOpen } from "../lib/market-hours.js";
import type { Bundle } from "../lib/statements.js";
import type { Candles } from "./calc.js";
import { compileScreen, SCREENS, type Screen, usesFundamentals } from "./catalogue.js";
import { hasFigures, StockContext, type StockData } from "./engine.js";
import { computeFundamentals } from "./fundamentals.js";
import { type Node, ruleColumns } from "./rules.js";
import { loadSeries, stockCandles, type TodayBar } from "./series.js";
import { BinaryWriter, deleteOldBuilds, readBinary, readBlob, writeBlob } from "./store.js";

const IST_MS = 5.5 * 3600_000;
const istDay = (ms: number) => Math.floor((ms + IST_MS) / 86400_000);
const round = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

// ── Company figures for every stock ────────────────────────────────

type FundRow = { f: Record<string, number | null>; y: Record<string, (number | null)[]>; e: { month: string; eps: number | null }[]; q: string | null };
type FundPack = { build: string; rows: Record<string, FundRow> };
let fundMemo: { at: number; pack: FundPack } | null = null;

export async function buildFundPack(env: Env) {
  const { results: list } = await env.DB.prepare(`SELECT s.symbol, s.face_value, c.market_cap_cr, c.price, c.pe, c.pe_to_sector, c.industry_pb, k.current_ratio, k.cash_per_share
    FROM stocks s JOIN company_statements st ON st.symbol = s.symbol AND st.found = 1
    LEFT JOIN company_snapshot c ON c.symbol = s.symbol LEFT JOIN company_metrics k ON k.symbol = s.symbol ORDER BY s.symbol`)
    .all<{ symbol: string; face_value: number | null; market_cap_cr: number | null; price: number | null; pe: number | null; pe_to_sector: number | null; industry_pb: number | null; current_ratio: number | null; cash_per_share: number | null }>();
  const rows: Record<string, FundRow> = {};
  for (let i = 0; i < list.length; i += 100) {
    const batch = list.slice(i, i + 100);
    const { results } = await env.DB.prepare("SELECT symbol, body FROM company_statements WHERE symbol IN (SELECT value FROM json_each(?))").bind(JSON.stringify(batch.map((b) => b.symbol))).all<{ symbol: string; body: string }>();
    const bodies = new Map(results.map((r) => [r.symbol, r.body]));
    for (const s of batch) {
      const body = bodies.get(s.symbol);
      if (!body) continue;
      const c = computeFundamentals(JSON.parse(body) as Bundle, { face_value: s.face_value }, s.market_cap_cr != null ? s : null, s.current_ratio != null || s.cash_per_share != null ? s : null);
      rows[s.symbol] = { f: c.fund, y: c.years, e: c.fyEps, q: c.latestQuarter };
    }
  }
  const build = String(Date.now());
  await writeBlob(env, "fund", build, JSON.stringify(rows));
  fundMemo = { at: Date.now(), pack: { build, rows } };
  return { stocks: Object.keys(rows).length };
}

async function loadFund(env: Env): Promise<FundPack | null> {
  if (fundMemo && Date.now() - fundMemo.at < 3600_000) return fundMemo.pack;
  const b = await readBlob(env, "fund");
  if (!b) return fundMemo?.pack ?? null;
  fundMemo = { at: Date.now(), pack: { build: b.build, rows: JSON.parse(b.text) } };
  return fundMemo.pack;
}

// ── Which stocks a screen looks at ─────────────────────────────────

let universeMemo: { at: number; fno: Set<string>; nifty50: Set<string>; nifty500: Set<string> } | null = null;
async function universes(env: Env) {
  if (universeMemo && Date.now() - universeMemo.at < 3600_000) return universeMemo;
  const [{ results: idx }, { results: fo }] = await Promise.all([
    env.DB.prepare("SELECT index_name, symbol FROM index_members").all<{ index_name: string; symbol: string }>(),
    env.DB.prepare("SELECT DISTINCT symbol FROM fo_oi WHERE date = (SELECT MAX(date) FROM fo_oi)").all<{ symbol: string }>(),
  ]);
  universeMemo = {
    at: Date.now(),
    fno: new Set(fo.map((r) => r.symbol)),
    nifty50: new Set(idx.filter((r) => r.index_name === "nifty50").map((r) => r.symbol)),
    nifty500: new Set(idx.filter((r) => r.index_name === "nifty500").map((r) => r.symbol)),
  };
  return universeMemo;
}

// ── The session's prices ───────────────────────────────────────────

type RawQuote = { last_price?: number; last_trade_time?: string; volume?: number; ohlc?: { open?: number; high?: number; low?: number } };
type LiveBars = { at: number; bars: Map<string, TodayBar>; asked: number };
const LIVE_TTL_MS = 20_000;
const QUOTE_CHUNK = 1000;
const QUOTE_GAP_MS = 1100; // Dhan allows one quote request a second across the account
let liveMemo: LiveBars | null = null;
let liveLoading: Promise<LiveBars> | null = null;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchLive(env: Env, stocks: { symbol: string; id: string }[]): Promise<LiveBars> {
  const today = istDay(Date.now());
  const stampToday = new Date(Date.now() + IST_MS).toISOString().slice(0, 10);
  const bySym = new Map(stocks.map((s) => [s.id, s.symbol]));
  const bars = new Map<string, TodayBar>();
  for (let i = 0; i < stocks.length; i += QUOTE_CHUNK) {
    if (i) await wait(QUOTE_GAP_MS);
    const ids = stocks.slice(i, i + QUOTE_CHUNK).map((s) => Number(s.id));
    let r = await dhanPost(env, "/marketfeed/quote", { NSE_EQ: ids }, "quotes", 8000);
    // A refusal is usually a collision with another quote on the account.
    for (let tries = 0; !r.ok && tries < 2; tries++) { await wait(QUOTE_GAP_MS + Math.random() * 400); r = await dhanPost(env, "/marketfeed/quote", { NSE_EQ: ids }, "quotes", 8000); }
    if (!r.ok) continue;
    for (const [id, q] of Object.entries((r.data?.data?.NSE_EQ ?? {}) as Record<string, RawQuote>)) {
      const sym = bySym.get(id);
      const stamp = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(q.last_trade_time ?? "");
      // Only stocks that traded today get a bar for today; the rest stay on their last close.
      if (!sym || !q.last_price || !q.ohlc?.open || !stamp || `${stamp[3]}-${stamp[2]}-${stamp[1]}` !== stampToday) continue;
      bars.set(sym, { day: today, o: q.ohlc.open, h: q.ohlc.high || q.last_price, l: q.ohlc.low || q.last_price, c: q.last_price, v: q.volume ?? 0 });
    }
  }
  return { at: Date.now(), bars, asked: stocks.length };
}

async function liveBars(env: Env, stocks: { symbol: string; id: string }[]): Promise<LiveBars> {
  if (liveMemo && Date.now() - liveMemo.at < LIVE_TTL_MS) return liveMemo;
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const key = new Request(`https://screens.cache/live/${Math.floor(Date.now() / LIVE_TTL_MS)}`);
  if (!liveLoading) {
    liveLoading = (async () => {
      const hit = await cache?.match(key).catch(() => undefined);
      if (hit) {
        const j = (await hit.json()) as { at: number; asked: number; bars: [string, TodayBar][] };
        return { at: j.at, asked: j.asked, bars: new Map(j.bars) };
      }
      const out = await fetchLive(env, stocks);
      if (cache && out.bars.size) await cache.put(key, new Response(JSON.stringify({ at: out.at, asked: out.asked, bars: [...out.bars] }), { headers: { "cache-control": "max-age=60" } })).catch(() => {});
      return out;
    })().then((v) => (liveMemo = v)).finally(() => { liveLoading = null; });
  }
  return liveLoading;
}

// ── Evaluating ─────────────────────────────────────────────────────

export type ResultRow = { symbol: string; name: string; sector: string | null; price: number | null; change_pct: number | null; mcap: number | null; values: (number | null)[] };

/** One stock passing through: price, day's change, market cap and the figures its rule tested. */
function rowFor(ctx: StockContext, data: StockData, name: string, sector: string | null, cols: { node: Node }[]): ResultRow {
  const c = data.daily.c, n = c.length;
  const price = n ? c[n - 1] : null, prev = n > 1 ? c[n - 2] : null;
  const shares = data.fund?.shares ?? null;
  return {
    symbol: data.symbol, name, sector,
    price: round(price), change_pct: price !== null && prev ? round((price / prev - 1) * 100) : null,
    mcap: price !== null && shares !== null ? Math.round(price * shares) : null,
    values: cols.map((col) => round(ctx.value(col.node))),
  };
}

function sortDefault(rows: ResultRow[]) {
  return rows.sort((a, b) => (b.mcap ?? -1) - (a.mcap ?? -1) || a.symbol.localeCompare(b.symbol));
}

type Prepared = { screen: Screen; node: Node; cols: ReturnType<typeof ruleColumns>; fund: boolean };
const prepare = (screen: Screen): Prepared => { const node = compileScreen(screen); return { screen, node, cols: ruleColumns(node), fund: usesFundamentals(node) }; };

async function inUniverse(env: Env, s: Screen): Promise<((symbol: string) => boolean)> {
  if (s.universe === "all") return () => true;
  const set = (await universes(env))[s.universe];
  return (symbol) => set.has(symbol);
}

/** `checked` counts stocks looked at. It ends up 0 when nothing passed and no stock even held the figures the rule reads. */
export type Run = { rows: ResultRow[]; checked: number; testable?: boolean };

function record(run: Run, ctx: StockContext, data: StockData, p: Prepared, name: string, sector: string | null) {
  run.checked++;
  if (ctx.test(p.node)) run.rows.push(rowFor(ctx, data, name, sector, p.cols));
  else if (!run.testable && hasFigures(ctx, p.node)) run.testable = true;
}
function finish(run: Run) {
  sortDefault(run.rows);
  if (!run.rows.length && !run.testable) run.checked = 0;
}

/** Runs screens over every stock on daily data, with today's bars if given. */
async function runDaily(env: Env, list: Screen[], today: Map<string, TodayBar> | null): Promise<Map<string, Run>> {
  const series = await loadSeries(env);
  if (!series) throw new Error("The price store isn't built yet");
  const prepared = list.map(prepare);
  const fund = await loadFund(env); // market cap is shown on every result, so always needed
  const filters = await Promise.all(list.map((s) => inUniverse(env, s)));
  const out = new Map<string, Run>(list.map((s) => [s.id, { rows: [], checked: 0 }]));
  for (const r of series.index.stocks) {
    const candles = stockCandles(series, r[0], today?.get(r[0]) ?? null);
    if (!candles || !candles.daily.c.length) continue;
    const f = fund?.rows[r[0]];
    const data: StockData = { symbol: r[0], ...candles, fund: f?.f ?? null, years: f?.y ?? null, fyEps: f?.e ?? null };
    const ctx = new StockContext(data);
    prepared.forEach((p, i) => {
      if (!filters[i](r[0])) return;
      if (p.fund && !f) return;
      record(out.get(p.screen.id)!, ctx, data, p, r[1], r[2]);
    });
  }
  for (const run of out.values()) finish(run);
  return out;
}

export type Freshness = { mode: "live" | "close" | "weekly" | "intraday"; as_of: string; computed_at: number; market_open: boolean; live_stocks?: number };
export type Answer = { rows: ResultRow[]; checked: number; freshness: Freshness };

const liveCache = new Map<string, { at: number; answer: Answer }>();
const CLOSE_CACHE_MS = 10 * 60_000;

/** A price-based screen, on the click. Live prices in market hours, otherwise the last close. */
export async function runLive(env: Env, screen: Screen): Promise<Answer> {
  const open = await marketOpen(env);
  const hit = liveCache.get(screen.id);
  if (hit && Date.now() - hit.at < (open ? LIVE_TTL_MS : CLOSE_CACHE_MS)) return hit.answer;
  const series = await loadSeries(env);
  if (!series) throw new Error("The price store isn't built yet");
  let today: LiveBars | null = null;
  if (open) today = await liveBars(env, series.index.stocks.filter((r) => r[3]).map((r) => ({ symbol: r[0], id: r[3]! })));
  const live = today !== null && today.bars.size > 0;
  const run = (await runDaily(env, [screen], live ? today!.bars : null)).get(screen.id)!;
  const answer: Answer = {
    rows: run.rows, checked: run.checked,
    freshness: live
      ? { mode: "live", as_of: new Date(today!.at).toISOString(), computed_at: Math.floor(Date.now() / 1000), market_open: true, live_stocks: today!.bars.size }
      : { mode: "close", as_of: series.index.as_of, computed_at: Math.floor(Date.now() / 1000), market_open: open },
  };
  liveCache.set(screen.id, { at: Date.now(), answer });
  if (liveCache.size > 100) liveCache.delete(liveCache.keys().next().value as string);
  return answer;
}

async function storeResult(env: Env, s: Screen, as_of: string, run: Run) {
  await env.DB.prepare("INSERT OR REPLACE INTO screen_results (screen_id, kind, as_of, total, checked, computed_at, body) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(s.id, s.kind, as_of, run.rows.length, run.checked, Math.floor(Date.now() / 1000), JSON.stringify(run.rows)).run();
}

/** Every weekly screen, stored with the close it used. */
export async function runWeekly(env: Env) {
  const list = SCREENS.filter((s) => s.kind === "weekly");
  await buildFundPack(env);
  const runs = await runDaily(env, list, null);
  const series = await loadSeries(env);
  for (const s of list) await storeResult(env, s, series!.index.as_of, runs.get(s.id)!);
  return { screens: list.length, as_of: series!.index.as_of };
}

const storedCache = new Map<string, { at: number; answer: Answer }>();

/** A stored result, weekly or intraday. Null until the first run. */
export async function storedAnswer(env: Env, screen: Screen): Promise<Answer | null> {
  const hit = storedCache.get(screen.id);
  if (hit && Date.now() - hit.at < 30_000) return hit.answer;
  const row = await env.DB.prepare("SELECT as_of, checked, computed_at, body FROM screen_results WHERE screen_id = ?").bind(screen.id).first<{ as_of: string; checked: number; computed_at: number; body: string }>();
  if (!row) return null;
  const answer: Answer = { rows: JSON.parse(row.body), checked: row.checked, freshness: { mode: screen.kind === "intraday" ? "intraday" : "weekly", as_of: row.as_of, computed_at: row.computed_at, market_open: false } };
  storedCache.set(screen.id, { at: Date.now(), answer });
  if (storedCache.size > 100) storedCache.delete(storedCache.keys().next().value as string);
  return answer;
}

// ── Intraday ───────────────────────────────────────────────────────

const INTRADAY_SESSIONS_DAYS = 45; // about 30 sessions: enough for MACD on 4-hour candles
const DHAN_GAP_MS = 220;
const M5_FIELDS = 6;

/** Stocks intraday screens look at: F&O and the Nifty 500. */
async function intradayStocks(env: Env, ids: Map<string, string | null>) {
  const u = await universes(env);
  return [...new Set([...u.fno, ...u.nifty500, ...u.nifty50])].flatMap((symbol) => { const id = ids.get(symbol); return id ? [{ symbol, id }] : []; });
}

async function fetchMinutes(env: Env, id: string, fromDay: string, toDay: string) {
  const ask = () => dhanPost(env, "/charts/intraday", { securityId: id, exchangeSegment: "NSE_EQ", instrument: "EQUITY", interval: "5", oi: false, fromDate: `${fromDay} 09:15:00`, toDate: `${toDay} 00:00:00` }, "candles", 8000);
  let r = await ask();
  if (!r.ok) { await wait(600); r = await ask(); } // usually a collision with another call on the account
  if (!r.ok) return null;
  const d = r.data as Record<string, number[]>;
  return Array.isArray(d.timestamp) ? d : null;
}

const istDate = (ms: number) => new Date(ms + IST_MS).toISOString().slice(0, 10);

type MinuteIndex = { base: number; parts: number; bytes: number; stocks: [string, number][] };

/** Refreshes the stored 5-minute history after the close: about 25 MB, written as it arrives. Rows are minutes past `base`, then prices and volume. */
export async function refreshMinuteHistory(env: Env) {
  const series = await loadSeries(env);
  if (!series) return { stocks: 0, failed: 0 };
  const stocks = await intradayStocks(env, new Map(series.index.stocks.map((r) => [r[0], r[3]])));
  const now = Date.now();
  const base = Math.floor(now / 60_000) * 60 - 60 * 86400;
  const build = String(now);
  const writer = new BinaryWriter(env, "min5", build);
  const held: [string, number][] = [];
  let failed = 0;
  for (const s of stocks) {
    const started = Date.now();
    const d = await fetchMinutes(env, s.id, istDate(now - INTRADAY_SESSIONS_DAYS * 86400_000), istDate(now + 86400_000));
    if (d) {
      const out = new Float32Array(d.timestamp.length * M5_FIELDS);
      d.timestamp.forEach((t, i) => out.set([(t - base) / 60, d.open[i], d.high[i], d.low[i], d.close[i], d.volume?.[i] ?? 0], i * M5_FIELDS));
      await writer.add(new Uint8Array(out.buffer));
      held.push([s.symbol, d.timestamp.length]);
    } else failed++;
    const rest = DHAN_GAP_MS - (Date.now() - started);
    if (rest > 0) await wait(rest);
  }
  const { parts, bytes } = await writer.close();
  // Most of a list missing is worse than yesterday's whole one.
  if (held.length < stocks.length * 0.8) {
    await env.DB.prepare("DELETE FROM screen_blobs WHERE name = 'min5' AND build = ?").bind(build).run();
    return { stocks: stocks.length, failed, kept: "previous" };
  }
  await writeBlob(env, "min5_index", `${istDate(now)}|${build}`, JSON.stringify({ base, parts, bytes, stocks: held } satisfies MinuteIndex));
  await deleteOldBuilds(env, "min5", build);
  return { stocks: stocks.length, failed };
}

async function loadMinutes(env: Env) {
  const head = await readBlob(env, "min5_index");
  if (!head) return null;
  const index = JSON.parse(head.text) as MinuteIndex;
  const bytes = await readBinary(env, "min5", head.build.split("|")[1] ?? "", index.parts, index.bytes);
  if (!bytes) return null;
  const floats = new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));
  const at = new Map<string, [number, number]>();
  let p = 0;
  for (const [sym, rows] of index.stocks) { at.set(sym, [p, rows]); p += rows * M5_FIELDS; }
  return { floats, at, base: index.base };
}

/** Stored candles from before today, followed by today's finished ones. */
function toCandles(floats: Float32Array, from: number, stored: number, base: number, todayNum: number, extra: Record<string, number[]> | null): Candles {
  let rows = stored;
  while (rows > 0 && istDay((floats[from + (rows - 1) * M5_FIELDS] * 60 + base) * 1000) >= todayNum) rows--;
  const n = rows + (extra?.timestamp?.length ?? 0);
  const t = new Array<number>(n), o = new Float64Array(n), h = new Float64Array(n), l = new Float64Array(n), c = new Float64Array(n), v = new Float64Array(n);
  let w = 0;
  for (let p = from; w < rows; p += M5_FIELDS, w++) { t[w] = floats[p] * 60 + base; o[w] = floats[p + 1]; h[w] = floats[p + 2]; l[w] = floats[p + 3]; c[w] = floats[p + 4]; v[w] = floats[p + 5]; }
  if (extra?.timestamp) extra.timestamp.forEach((ts, i) => { t[w] = ts; o[w] = extra.open[i]; h[w] = extra.high[i]; l[w] = extra.low[i]; c[w] = extra.close[i]; v[w] = extra.volume[i] ?? 0; w++; });
  return { t, o, h, l, c, v };
}

/**
 * One intraday pass: this session's 5-minute candles for every stock, then every intraday screen on finished candles.
 * `closed` skips asking for today's candles and answers from the stored history, so outside market hours
 * these screens show the last session instead of nothing.
 */
export async function runIntradayCycle(env: Env, opts: { force?: boolean; closed?: boolean } = {}) {
  if (!opts.force && !opts.closed && !(await marketOpen(env))) return { ran: false as const };
  const series = await loadSeries(env);
  const history = await loadMinutes(env);
  if (!series || !history) return { ran: false as const, why: "history not loaded" };
  const now = Date.now();
  const today = istDate(now), todayNum = istDay(now);
  const cutoff = Math.floor(now / 1000);
  const stocks = await intradayStocks(env, new Map(series.index.stocks.map((r) => [r[0], r[3]])));
  const minutes = new Map<string, Record<string, number[]>>();
  let failed = 0;
  for (const s of opts.closed ? [] : stocks) {
    const started = Date.now();
    const d = await fetchMinutes(env, s.id, today, istDate(now + 86400_000));
    if (d) {
      // Only finished candles: the one still forming would make a signal appear and then vanish.
      let keep = d.timestamp.length;
      while (keep > 0 && d.timestamp[keep - 1] + 300 > cutoff) keep--;
      minutes.set(s.symbol, { timestamp: d.timestamp.slice(0, keep), open: d.open.slice(0, keep), high: d.high.slice(0, keep), low: d.low.slice(0, keep), close: d.close.slice(0, keep), volume: (d.volume ?? []).slice(0, keep) });
    } else failed++;
    const rest = DHAN_GAP_MS - (Date.now() - started);
    if (rest > 0) await wait(rest);
  }
  if (!opts.closed && minutes.size < stocks.length * 0.5) return { ran: false as const, why: `only ${minutes.size} of ${stocks.length} answered` };

  const list = SCREENS.filter((s) => s.kind === "intraday");
  const prepared = list.map(prepare);
  const filters = await Promise.all(list.map((s) => inUniverse(env, s)));
  const fund = await loadFund(env);
  const runs = new Map<string, Run>(list.map((s) => [s.id, { rows: [], checked: 0 }]));
  let lastCandle = 0;
  const names = series.rows;
  for (const s of stocks) {
    const m = minutes.get(s.symbol);
    const stored = history.at.get(s.symbol);
    if (!m && !stored) continue;
    // In the session, today's candles come fresh; after the close the stored ones are complete and include today.
    const all = toCandles(history.floats, stored?.[0] ?? 0, stored?.[1] ?? 0, history.base, opts.closed ? Infinity : todayNum, m ?? null);
    const n = m?.timestamp.length ?? 0;
    if (all.c.length) lastCandle = Math.max(lastCandle, Number(all.t[all.c.length - 1]));
    const bar: TodayBar | null = n ? { day: todayNum, o: m!.open[0], h: Math.max(...m!.high), l: Math.min(...m!.low), c: m!.close[n - 1], v: m!.volume.reduce((a, b) => a + (b ?? 0), 0) } : null;
    const candles = stockCandles(series, s.symbol, bar);
    if (!candles) continue;
    const f = fund?.rows[s.symbol];
    const data: StockData = { symbol: s.symbol, ...candles, minutes: all, cutoff, fund: f?.f ?? null, years: f?.y ?? null, fyEps: f?.e ?? null };
    const ctx = new StockContext(data);
    const row = names.get(s.symbol)!;
    prepared.forEach((p, i) => {
      if (!filters[i](s.symbol)) return;
      record(runs.get(p.screen.id)!, ctx, data, p, row[1], row[2]);
    });
  }
  const asOf = lastCandle ? new Date((lastCandle + 300) * 1000).toISOString() : new Date(now).toISOString();
  for (const s of list) { const run = runs.get(s.id)!; finish(run); await storeResult(env, s, asOf, run); }
  return { ran: true as const, stocks: opts.closed ? stocks.length : minutes.size, failed, screens: list.length, as_of: asOf };
}

// ── What the pages ask ─────────────────────────────────────────────

export async function answerFor(env: Env, screen: Screen): Promise<Answer | null> {
  return screen.kind === "live" ? runLive(env, screen) : storedAnswer(env, screen);
}

/** Stored counts for the catalogue page. Live screens have none, since theirs change with the market. */
export async function storedCounts(env: Env) {
  // A screen no stock could be tested on has no meaningful count yet.
  const { results } = await env.DB.prepare("SELECT screen_id, total, as_of FROM screen_results WHERE checked > 0").all<{ screen_id: string; total: number; as_of: string }>();
  return new Map(results.map((r) => [r.screen_id, r]));
}
