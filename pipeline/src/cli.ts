// Pipeline entry point.
//
//   npm run data:stocks                       refresh the stock master + sectors
//   npm run data:daily [-- YYYY-MM-DD]        load one day's bhavcopy (default: latest)
//   npm run data:backfill [-- 365]            load N calendar days of history
//   npm run data:import -- fii-dii <file>     import FII/DII flows (.json or .csv)
//   npm run data:import -- financials <file>  import results (.csv or .json)
//   npm run data:import -- shareholding <file>
//
// Every price-changing command rebuilds stock_metrics at the end.

import { resolve } from "node:path";
import { openDatabase } from "../../api/src/db/sqlite.js";
import { syncStocks } from "./jobs/stocks.js";
import { backfill, loadBhavcopy, loadLatest } from "./jobs/bhavcopy.js";
import { rebuildMetrics } from "./jobs/metrics.js";
import { importFiiDii, importFinancials, importShareholding } from "./jobs/imports.js";

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
      break;
    }
    case "daily": {
      const r = args[0] ? await loadBhavcopy(db, args[0], { force: true }) : await loadLatest(db);
      console.log(r ? `Bhavcopy ${r.date}: ${r.status} (${r.rows} rows)` : "No bhavcopy found in the last week.");
      metrics();
      break;
    }
    case "backfill": {
      await backfill(db, Number(args[0] ?? 365));
      metrics();
      break;
    }
    case "metrics": {
      metrics();
      break;
    }
    case "import": {
      const [kind, file] = args;
      if (!kind || !file) throw new Error("usage: import <fii-dii|financials|shareholding> <file>");
      const path = resolve(process.env.INIT_CWD ?? process.cwd(), file);
      const n =
        kind === "fii-dii" ? importFiiDii(db, path)
        : kind === "financials" ? importFinancials(db, path)
        : kind === "shareholding" ? importShareholding(db, path)
        : (() => { throw new Error(`unknown import kind: ${kind}`); })();
      console.log(`Imported ${n} ${kind} rows from ${path}.`);
      if (kind !== "fii-dii") metrics();
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
