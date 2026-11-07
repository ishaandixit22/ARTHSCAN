// Writes web/src/lib/server/bse-tickers.json: each listed company's ISIN and its ticker on
// TradingView's BSE feed. TradingView's free widget refuses NSE symbols, and an NSE symbol can be a
// different company on BSE, so companies are matched by ISIN from Dhan's scrip master.
// Run now and then: node scripts/build-bse-tickers.mjs  A new listing missing here keeps the Dhan chart.

import { writeFileSync } from "node:fs";

const MASTER = "https://images.dhan.co/api-data/api-scrip-master-detailed.csv";
const SITE = process.env.SITE ?? "https://arthscan.me";
const OUT = new URL("../web/src/lib/server/bse-tickers.json", import.meta.url);

const lines = (await (await fetch(MASTER)).text()).split("\n");
const cols = lines[0].split(",");
const at = (name) => cols.indexOf(name);
const [EXCH, SEG, ISIN, TYPE, SYMBOL, SERIES] = ["EXCH_ID", "SEGMENT", "ISIN", "INSTRUMENT_TYPE", "UNDERLYING_SYMBOL", "SERIES"].map(at);
// Sampled against TradingView: it has no stocks in these two series, and shows an error for them.
const NOT_ON_TRADINGVIEW = new Set(["NS", "NT"]);

const bse = new Map();
for (const line of lines.slice(1)) {
  const f = line.split(",");
  // TradingView writes - and & in a ticker as _ (BAJAJ-AUTO is BSE:BAJAJ_AUTO).
  if (f[EXCH] === "BSE" && f[SEG] === "E" && f[TYPE] === "ES" && f[ISIN]?.startsWith("IN") && f[SYMBOL] && !NOT_ON_TRADINGVIEW.has(f[SERIES])) bse.set(f[ISIN], f[SYMBOL].replace(/[-&]/g, "_"));
}

const { rows } = await (await fetch(`${SITE}/search-index.json`)).json();
const out = {};
for (const [, , isin] of rows) if (bse.has(isin)) out[isin] = bse.get(isin);
writeFileSync(OUT, `${JSON.stringify(out)}\n`);
const onNse = rows.filter((r) => !String(r[0]).startsWith("BSE-"));
console.log(`${Object.keys(out).length} of ${rows.length} companies mapped; NSE-listed: ${onNse.filter((r) => bse.has(r[2])).length} of ${onNse.length}.`);
