// Publishes market data from the local SQLite working copy to Cloudflare D1.
//
// The pipeline keeps running against SQLite (fast, no limits on how much it
// reads); D1 is the published copy the Workers serve. Only market-data tables
// are sent — accounts, tokens and OAuth state live in D1 alone and are never
// overwritten from here.
//
//   npm run d1:push -- seed  [--local]   everything (first deploy)
//   npm run d1:push -- sync  [--local]   last 3 days of prices + derived tables
//   npm run d1:push -- sync 10 [--local] last 10 days
//   add --fundamentals to also send financials + shareholding
//   add --results to send the quarterly results loaded this week
//   add --insights-history to send all index valuations and F&O bans (first publish)
//
// --local targets wrangler's local D1 (for `wrangler dev`); default is remote.
//
// D1 bills (and on the free plan, caps at 100k/day) by rows WRITTEN, so sync
// sends only what changed: the recent price window, adjustment multipliers
// only for symbols with a split inside that window (and only rows whose value
// actually differs), and the small derived tables. A seed is ~780k writes —
// more than a free-plan day — so seed only on a paid plan or fresh database.

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { openDatabase } from "../../api/src/db/sqlite.js";
import { ROOT } from "./lib.js";

const args = process.argv.slice(2);
const mode = args[0];
const local = args.includes("--local");
const days = Number(args.find((a, i) => i > 0 && /^\d+$/.test(a)) ?? 3);
const fundamentals = mode === "seed" || args.includes("--fundamentals");
const insightsHistory = mode === "seed" || args.includes("--insights-history");
if (mode !== "seed" && mode !== "sync") {
  console.error("usage: d1:push -- <seed|sync> [days] [--local]");
  process.exit(1);
}

const db = openDatabase();
const OUT = resolve(ROOT, "data/d1");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// D1 caps a single statement at 100 KB; 100 rows per INSERT stays well under.
const ROWS_PER_INSERT = 100;
// Keep each file a manageable upload.
const ROWS_PER_FILE = 100_000;

const sqlValue = (v: unknown) =>
  v === null || v === undefined ? "NULL" : typeof v === "number" || typeof v === "bigint" ? String(v) : `'${String(v).replace(/'/g, "''")}'`;

const files: string[] = [];
let fileNo = 0;

function emit(sql: string[]) {
  if (!sql.length) return;
  const path = resolve(OUT, `${String(++fileNo).padStart(3, "0")}.sql`);
  writeFileSync(path, sql.join("\n") + "\n");
  files.push(path);
}

/** INSERT OR REPLACE every row of `query` into `table`, chunked into files. */
function copy(table: string, query: string, params: unknown[] = [], prelude: string[] = []) {
  const stmt = db.raw.prepare(query);
  let sql: string[] = [...prelude];
  let batch: string[] = [];
  let inFile = 0;
  let cols: string[] | null = null;
  let total = 0;
  const flushBatch = () => {
    if (batch.length && cols) sql.push(`INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES\n${batch.join(",\n")};`);
    batch = [];
  };
  for (const row of stmt.iterate(...(params as never[])) as Iterable<Record<string, unknown>>) {
    cols ??= Object.keys(row);
    batch.push(`(${cols.map((c) => sqlValue(row[c])).join(", ")})`);
    inFile++;
    total++;
    if (batch.length === ROWS_PER_INSERT) flushBatch();
    if (inFile === ROWS_PER_FILE) {
      flushBatch();
      emit(sql);
      sql = [];
      inFile = 0;
    }
  }
  flushBatch();
  emit(sql);
  console.log(`  ${table}: ${total} rows`);
}

const latest = (db.raw.prepare("SELECT MAX(date) AS d FROM daily_prices").get() as { d: string }).d;
console.log(`${mode} → ${local ? "local" : "remote"} D1 (latest price date ${latest})`);

copy("stocks", "SELECT * FROM stocks");
const windowStart = (db.raw.prepare("SELECT date(?, ?) AS d").get(latest, `-${days} days`) as { d: string }).d;

if (mode === "seed") {
  copy("daily_prices", "SELECT * FROM daily_prices ORDER BY date, symbol", [], ["DELETE FROM daily_prices;"]);
  copy("price_adjustments", "SELECT * FROM price_adjustments", [], ["DELETE FROM price_adjustments;"]);
} else {
  // Rows inside the window carry their current adj, so they need nothing extra.
  copy("daily_prices", "SELECT * FROM daily_prices WHERE date >= ? ORDER BY date, symbol", [windowStart]);
  // A split with an ex-date inside the window changes adj on that symbol's
  // OLDER rows. Send each symbol's adj as explicit date ranges (idempotent),
  // guarded so rows already holding the right value aren't rewritten.
  const ranges = db.raw.prepare(`
    SELECT symbol, adj, MIN(date) AS lo, MAX(date) AS hi FROM daily_prices
    WHERE date < ? AND symbol IN (SELECT symbol FROM price_adjustments WHERE ex_date >= ?)
    GROUP BY symbol, adj`).all(windowStart, windowStart) as { symbol: string; adj: number; lo: string; hi: string }[];
  emit(ranges.map((r) =>
    `UPDATE daily_prices SET adj = ${r.adj} WHERE symbol = ${sqlValue(r.symbol)} AND date BETWEEN ${sqlValue(r.lo)} AND ${sqlValue(r.hi)} AND adj != ${r.adj};`));
  console.log(`  adj ranges for new splits: ${ranges.length}`);
  copy("price_adjustments", "SELECT * FROM price_adjustments WHERE ex_date >= ?", [windowStart]);
}
copy("stock_metrics", "SELECT * FROM stock_metrics", [],
  // Drop stocks that stopped trading (the local rebuild already left them out).
  [`DELETE FROM stock_metrics WHERE as_of < date(${sqlValue(latest)}, '-14 days');`]);
copy("fii_dii", "SELECT * FROM fii_dii WHERE date >= ?", [mode === "seed" ? "0000-00-00" : windowStart]);
// NSDL FPI flows: a few hundred rows in all, so always sent whole.
copy("fpi_daily", "SELECT * FROM fpi_daily");
copy("fpi_sector", "SELECT * FROM fpi_sector");
// Index valuations and F&O ban lists: small tables, one row per index or banned stock per day.
const since = insightsHistory ? "0000-00-00" : windowStart;
copy("index_daily", "SELECT * FROM index_daily WHERE date >= ?", [since]);
copy("fo_ban", "SELECT * FROM fo_ban WHERE date >= ?", [since], [`DELETE FROM fo_ban WHERE date >= ${sqlValue(since)};`]);
// Quarterly results the results job loaded this week (all quarters for those companies).
if (args.includes("--results") && !fundamentals) {
  copy("financials", "SELECT * FROM financials WHERE symbol IN (SELECT symbol FROM results_checks WHERE checked_at >= datetime('now', '-7 days') AND found = 1)");
  copy("results_checks", "SELECT * FROM results_checks WHERE checked_at >= datetime('now', '-7 days')");
}
if (fundamentals) {
  copy("financials", "SELECT * FROM financials");
  copy("shareholding", "SELECT * FROM shareholding");
}

console.log(`Wrote ${files.length} SQL file(s) to data/d1/. Uploading…`);
for (const file of files) {
  // D1's import API occasionally fails transiently; every file is idempotent, so retry.
  let r = spawnSync("true");
  for (let attempt = 1; attempt <= 3; attempt++) {
    r = spawnSync(
      "npx",
      ["wrangler", "d1", "execute", "arthscan", local ? "--local" : "--remote", "--file", file, "--yes"],
      { cwd: resolve(ROOT, "api"), stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
    );
    if (r.status === 0) break;
    console.log(`  ${file.split("/").pop()} failed (attempt ${attempt}); retrying`);
    spawnSync("sleep", [String(5 * attempt)]);
  }
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    console.error(`Upload failed at ${file}. Re-running is safe (rows are replaced, not duplicated).`);
    process.exit(1);
  }
  console.log(`  uploaded ${file.split("/").pop()}`);
}
console.log("Done.");
