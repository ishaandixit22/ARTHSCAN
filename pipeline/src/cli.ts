// Pipeline entry point.
//
//   npm run data:stocks                       refresh the stock master + sectors
//   npm run data:daily [-- YYYY-MM-DD]        load one day's bhavcopy (default: latest)
//   npm run data:backfill [-- 365]            load N calendar days of history
//   npm run data:import -- fii-dii <file>     import FII/DII flows (.json or .csv)
//   npm run data:import -- financials <file>  import results (.csv or .json)
//   npm run data:import -- shareholding <file>
//   npm run data:import -- fpi-daily <file>        NSDL daily FPI equity flows (.html or .csv)
//   npm run data:import -- fpi-sectors <files…>    NSDL fortnightly sector reports (.html or .csv)
//   npm run data:reports [-- 365]             backfill deliveries, index valuations, F&O bans
//   npm run data:results [-- 250]             load this season's quarterly results (largest declared companies first)
//   npm run data:fo-ban                       refresh today's and the next session's F&O ban + open interest
//
// Every price-changing command rebuilds stock_metrics at the end.

import { resolve } from "node:path";
import { openDatabase } from "../../api/src/db/sqlite.js";
import { syncStocks } from "./jobs/stocks.js";
import { syncDhanIds } from "./jobs/dhan.js";
import { backfill, loadBhavcopy, loadLatest } from "./jobs/bhavcopy.js";
import { rebuildMetrics } from "./jobs/metrics.js";
import { backfillReports, loadFoBan, loadOpenInterest, loadReports } from "./jobs/reports.js";
import { loadResults } from "./jobs/results.js";
import { addDays, isWeekday } from "./lib.js";
import { importFiiDii, importFinancials, importFpiDaily, importFpiSectors, importShareholding } from "./jobs/imports.js";

const [cmd, ...args] = process.argv.slice(2);
const db = openDatabase();

function metrics() {
  const t = Date.now();
  const n = rebuildMetrics(db);
  console.log(`Metrics rebuilt for ${n} stocks in ${Date.now() - t} ms.`);
}

async function main() {
  switch (cmd) {
    case "stocks": {
      console.log(`Stock master: ${await syncStocks(db)} rows.`);
      console.log(`Dhan live-feed ids: ${await syncDhanIds(db)} stocks mapped.`);
      break;
    }
    case "daily": {
      const r = args[0] ? await loadBhavcopy(db, args[0], { force: true }) : await loadLatest(db);
      console.log(r ? `Bhavcopy ${r.date}: ${r.status} (${r.rows} rows)` : "No bhavcopy found in the last week.");
      if (r && r.status !== "holiday") {
        const rep = await loadReports(db, r.date);
        console.log(`Reports ${rep.date}: ${rep.deliveries} deliveries, ${rep.indices} indices, ${rep.foBan} in F&O ban, ${rep.openInterest} F&O open-interest rows.`);
        console.log(rep.foBanNext == null ? `F&O ban for ${rep.next}: not published yet.` : `F&O ban for ${rep.next}: ${rep.foBanNext} stocks.`);
      }
      metrics();
      break;
    }
    case "backfill": {
      await backfill(db, Number(args[0] ?? 365));
      metrics();
      break;
    }
    case "results": {
      const r = await loadResults(db, { max: Number(args[0] ?? 250) });
      console.log(`Results ${r.quarter}: ${r.declared} companies have filed on NSE; asked the provider about ${r.asked}, ${r.found} had the quarter; ${r.remaining} left for the next run.`);
      metrics(); // P/E needs four quarters of EPS
      break;
    }
    case "fo-ban": {
      // Quick refresh between daily runs: the latest session's open interest and ban
      // lists for it and the next session.
      const last = (db.raw.prepare("SELECT MAX(date) AS d FROM daily_prices").get() as { d: string }).d;
      const oi = await loadOpenInterest(db, last);
      const banLast = await loadFoBan(db, last);
      let next = addDays(last, 1);
      while (!isWeekday(next)) next = addDays(next, 1);
      const banNext = await loadFoBan(db, next);
      console.log(`Open interest ${last}: ${oi} rows. Ban ${last}: ${banLast ?? "no file"}. Ban ${next}: ${banNext ?? "not published yet"}.`);
      break;
    }
    case "reports": {
      // Deliveries for the last 90 days, index valuations and ban lists for the whole window.
      await backfillReports(db, Number(args[0] ?? 365));
      metrics();
      break;
    }
    case "metrics": {
      metrics();
      break;
    }
    case "import": {
      const [kind, file, ...more] = args;
      if (!kind || !file) throw new Error("usage: import <fii-dii|financials|shareholding|fpi-daily|fpi-sectors> <file…>");
      const path = resolve(process.env.INIT_CWD ?? process.cwd(), file);
      const n =
        kind === "fii-dii" ? importFiiDii(db, path)
        : kind === "fpi-daily" ? importFpiDaily(db, path)
        : kind === "fpi-sectors" ? importFpiSectors(db, [file, ...more].map((f) => resolve(process.env.INIT_CWD ?? process.cwd(), f)))
        : kind === "financials" ? importFinancials(db, path)
        : kind === "shareholding" ? importShareholding(db, path)
        : (() => { throw new Error(`unknown import kind: ${kind}`); })();
      console.log(`Imported ${n} ${kind} rows from ${path}.`);
      if (kind === "financials" || kind === "shareholding") metrics();
      break;
    }
    default:
      console.log("commands: stocks | daily [date] | backfill [days] | metrics | import <kind> <file>");
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
