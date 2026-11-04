// Every stock's candles in one binary blob, rebuilt when a new session or more long history arrives.
// A screen run reads this once per isolate and works from memory, so a click doesn't scan the price table.
//
// Rows are Float32: day number, open, high, low, close, volume. Older months come first, then days.
// The blob is about 45 MB, and a Worker gets 128 MB, so it is written and read a part at a time and
// held only once. A new build's parts go in beside the old, and the index row switches to it last.

import type { Env } from "../env.js";
import type { Candles } from "./calc.js";
import { base64ToFloats, BinaryWriter, deleteOldBuilds, readBinary, readBlob, writeBlob } from "./store.js";

export const DAILY_BARS = 520;
const FIELDS = 6;
const dayNum = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86400_000);

/** symbol, name, sector, Dhan id, daily rows, older-month rows, all-time high and low before those rows, long history loaded. */
export type IndexRow = [string, string, string | null, string | null, number, number, number | null, number | null, 0 | 1];
export type SeriesIndex = { as_of: string; long: number; parts: number; bytes: number; stocks: IndexRow[] };

type Loaded = { build: string; at: number; index: SeriesIndex; floats: Float32Array; offsets: Map<string, number>; rows: Map<string, IndexRow> };
let memo: Loaded | null = null;
let loading: Promise<Loaded | null> | null = null;
const RECHECK_MS = 5 * 60_000;

async function load(env: Env): Promise<Loaded | null> {
  const head = await readBlob(env, "series_index");
  if (!head) return memo;
  if (memo && memo.build === head.build) { memo.at = Date.now(); return memo; }
  const index = JSON.parse(head.text) as SeriesIndex;
  memo = null; // let the old copy go before reading the new one
  const bytes = await readBinary(env, "series", head.build, index.parts, index.bytes);
  if (!bytes) return null;
  const floats = new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));
  const offsets = new Map<string, number>(), rows = new Map<string, IndexRow>();
  let at = 0;
  for (const r of index.stocks) {
    offsets.set(r[0], at);
    rows.set(r[0], r);
    at += (r[4] + r[5]) * FIELDS;
  }
  memo = { build: head.build, at: Date.now(), index, floats, offsets, rows };
  return memo;
}

export async function loadSeries(env: Env): Promise<Loaded | null> {
  if (memo && Date.now() - memo.at < RECHECK_MS) return memo;
  if (!loading) loading = load(env).finally(() => { loading = null; });
  return loading;
}

// Reused across stocks: a run looks at one stock at a time, and thousands of fresh arrays would crowd the Worker's memory.
const CAP = 2000;
const makeScratch = () => ({ o: new Float64Array(CAP), h: new Float64Array(CAP), l: new Float64Array(CAP), c: new Float64Array(CAP), v: new Float64Array(CAP) });
const scratchDaily = makeScratch(), scratchOlder = makeScratch();

function candles(sc: ReturnType<typeof makeScratch>, f: Float32Array, from: number, rows: number, extra?: number[]): Candles {
  const n = rows + (extra ? 1 : 0);
  const t = new Array<number>(n);
  for (let i = 0, p = from; i < rows; i++, p += FIELDS) { t[i] = f[p]; sc.o[i] = f[p + 1]; sc.h[i] = f[p + 2]; sc.l[i] = f[p + 3]; sc.c[i] = f[p + 4]; sc.v[i] = f[p + 5]; }
  if (extra) { t[rows] = extra[0]; sc.o[rows] = extra[1]; sc.h[rows] = extra[2]; sc.l[rows] = extra[3]; sc.c[rows] = extra[4]; sc.v[rows] = extra[5]; }
  return { t, o: sc.o.subarray(0, n), h: sc.h.subarray(0, n), l: sc.l.subarray(0, n), c: sc.c.subarray(0, n), v: sc.v.subarray(0, n) };
}

export type TodayBar = { day: number; o: number; h: number; l: number; c: number; v: number };

/** One stock's candles, with an optional bar for today on the end. Valid until the next call: use them before asking for another stock. */
export function stockCandles(m: Loaded, symbol: string, today?: TodayBar | null) {
  const r = m.rows.get(symbol);
  if (!r) return null;
  const start = m.offsets.get(symbol)!;
  const dailyFrom = start + r[5] * FIELDS;
  const older = r[5] ? candles(scratchOlder, m.floats, start, r[5]) : null;
  let rows = r[4];
  let extra: number[] | undefined;
  if (today) {
    const last = rows ? m.floats[dailyFrom + (rows - 1) * FIELDS] : -1;
    if (last === today.day) rows--;
    if (today.day >= last) extra = [today.day, today.o, today.h, today.l, today.c, today.v];
  }
  return { daily: candles(scratchDaily, m.floats, dailyFrom, rows, extra), monthlyOlder: older, ath: r[8] ? (r[6] ?? -Infinity) : null, atl: r[8] ? (r[7] ?? Infinity) : null };
}

/** Rebuilds the blob from daily_prices and the long-history store. */
export async function buildSeries(env: Env): Promise<{ stocks: number; bytes: number; as_of: string | null }> {
  const latest = (await env.DB.prepare("SELECT MAX(date) AS d FROM daily_prices").first<{ d: string }>())?.d ?? null;
  if (!latest) return { stocks: 0, bytes: 0, as_of: null };
  const { results: list } = await env.DB.prepare(`SELECT s.symbol, s.name, s.sector, s.dhan_security_id AS id FROM stocks s JOIN stock_metrics m ON m.symbol = s.symbol
    WHERE COALESCE(s.instrument_type, 'ES') = 'ES' AND m.as_of >= date(?, '-14 days') ORDER BY s.symbol`).bind(latest).all<{ symbol: string; name: string; sector: string | null; id: string | null }>();
  const { results: splits } = await env.DB.prepare("SELECT symbol, ex_date, factor FROM price_adjustments").all<{ symbol: string; ex_date: string; factor: number }>();
  const splitsBy = new Map<string, { ex_date: string; factor: number }[]>();
  for (const s of splits) (splitsBy.get(s.symbol) ?? splitsBy.set(s.symbol, []).get(s.symbol)!).push(s);

  const longCount = (await env.DB.prepare("SELECT COUNT(*) AS n FROM price_long").first<{ n: number }>())?.n ?? 0;
  const build = `${latest}/${longCount}/${Date.now()}`;
  const writer = new BinaryWriter(env, "series", build);
  const stocks: IndexRow[] = [];
  for (let i = 0; i < list.length; i += 100) {
    const batch = list.slice(i, i + 100);
    const json = JSON.stringify(batch.map((b) => b.symbol));
    const [{ results: bars }, { results: longs }] = await Promise.all([
      env.DB.prepare(`SELECT symbol, date, open * adj AS o, high * adj AS h, low * adj AS l, close * adj AS c, volume / adj AS v FROM daily_prices
        WHERE symbol IN (SELECT value FROM json_each(?)) ORDER BY symbol, date`).bind(json).all<{ symbol: string; date: string; o: number | null; h: number | null; l: number | null; c: number; v: number | null }>(),
      env.DB.prepare("SELECT symbol, fetched_on, ath, atl, daily, monthly FROM price_long WHERE symbol IN (SELECT value FROM json_each(?))").bind(json).all<{ symbol: string; fetched_on: string; ath: number | null; atl: number | null; daily: string | null; monthly: string | null }>(),
    ]);
    const longBy = new Map(longs.map((l) => [l.symbol, l]));
    let a = 0;
    for (const b of batch) {
      const here: typeof bars = [];
      while (a < bars.length && bars[a].symbol === b.symbol) here.push(bars[a++]);
      const long = longBy.get(b.symbol);
      // Splits after the long history was fetched move it onto today's share basis.
      const factor = (splitsBy.get(b.symbol) ?? []).filter((s) => long && s.ex_date > long.fetched_on).reduce((x, s) => x * s.factor, 1);
      const scale = (src: Float32Array) => {
        if (factor === 1) return src;
        const out = new Float32Array(src);
        for (let p = 0; p < out.length; p += FIELDS) { out[p + 1] *= factor; out[p + 2] *= factor; out[p + 3] *= factor; out[p + 4] *= factor; out[p + 5] /= factor; }
        return out;
      };
      const firstOwn = here.length ? dayNum(here[0].date) : Infinity;
      const olderDaily = long ? scale(base64ToFloats(long.daily)) : new Float32Array(0);
      const olderMonthly = long ? scale(base64ToFloats(long.monthly)) : new Float32Array(0);
      let olderRows = Math.floor(olderDaily.length / FIELDS);
      while (olderRows > 0 && olderDaily[(olderRows - 1) * FIELDS] >= firstOwn) olderRows--; // stored prices win where both exist
      const dailyRows = Math.min(DAILY_BARS, olderRows + here.length);
      const useOwn = Math.min(here.length, dailyRows);
      const useOlder = dailyRows - useOwn;
      const monthlyRows = Math.floor(olderMonthly.length / FIELDS);
      const out = new Float32Array((monthlyRows + dailyRows) * FIELDS);
      out.set(olderMonthly, 0);
      let w = monthlyRows * FIELDS;
      out.set(olderDaily.subarray((olderRows - useOlder) * FIELDS, olderRows * FIELDS), w);
      w += useOlder * FIELDS;
      for (const r of here.slice(here.length - useOwn)) {
        out.set([dayNum(r.date), r.o ?? r.c, r.h ?? r.c, r.l ?? r.c, r.c, r.v ?? 0], w);
        w += FIELDS;
      }
      await writer.add(new Uint8Array(out.buffer));
      stocks.push([b.symbol, b.name, b.sector, b.id, dailyRows, monthlyRows, long?.ath != null ? long.ath * factor : null, long?.atl != null ? long.atl * factor : null, long ? 1 : 0]);
    }
  }
  const { parts, bytes } = await writer.close();
  await writeBlob(env, "series_index", build, JSON.stringify({ as_of: latest, long: longCount, parts, bytes, stocks } satisfies SeriesIndex));
  await deleteOldBuilds(env, "series", build);
  return { stocks: stocks.length, bytes, as_of: latest };
}

/** Whether the blob is behind: a newer session, or a good deal more long history since it was built. */
export async function seriesStale(env: Env): Promise<boolean> {
  const row = await env.DB.prepare(`SELECT (SELECT build FROM screen_blobs WHERE name = 'series_index' AND part = 0) AS build, (SELECT MAX(date) FROM daily_prices) AS d, (SELECT COUNT(*) FROM price_long) AS n,
    (SELECT COUNT(*) FROM stocks s JOIN stock_metrics m ON m.symbol = s.symbol LEFT JOIN price_long p ON p.symbol = s.symbol WHERE s.dhan_security_id IS NOT NULL AND COALESCE(s.instrument_type, 'ES') = 'ES' AND p.symbol IS NULL) AS waiting`)
    .first<{ build: string | null; d: string; n: number; waiting: number }>();
  if (!row?.build) return true;
  const [asOf, long] = row.build.split("/");
  if (row.d > asOf) return true;
  const grown = row.n - Number(long);
  return grown >= 500 || (row.waiting === 0 && grown > 0);
}
