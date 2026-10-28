# Data pipeline

All commands run from the repo root and write to `DATABASE_PATH` (default `data/arthscan.db`).
Downloads are cached in `data/cache/`, so re-running a backfill is cheap.

| Command | Does |
|---|---|
| `npm run data:stocks` | Refresh the stock master (NSE main board + SME lists) and sector tags (index lists). Weekly is plenty. |
| `npm run data:daily` | Load the latest bhavcopy (walks back up to a week), then rebuild adjustments + metrics. |
| `npm run data:daily -- 2026-10-28` | Load one specific date. |
| `npm run data:backfill -- 365` | Load every session in the last N calendar days that isn't loaded yet. |
| `npm run metrics -w pipeline` | Rebuild `price_adjustments` and `stock_metrics` only. |
| `npm run data:import -- <kind> <file>` | Import a file (below). |

Schedule (macOS/Linux cron, weekdays 7:15 pm IST):

```
15 19 * * 1-5  cd "/path/to/STOCK PLATFORM" && npm run data:daily >> data/daily.log 2>&1
```

## Import formats

CSV or JSON (an array of objects). Column names are matched case- and punctuation-insensitively.
Dates may be `YYYY-MM-DD`, `DD-MMM-YYYY` or `DD-MM-YYYY`.

### `fii-dii`

NSE's "FII/DII trading activity" JSON works as-is:

```json
[{"category":"FII/FPI","date":"28-Oct-2026","buyValue":"16834.53","sellValue":"15962.7","netValue":"871.83"}]
```

CSV with the same columns also works: `date,category,buyValue,sellValue,netValue` (INR crore;
`category` starting with FII/FPI or DII). Re-importing a date replaces it.

### `financials`

```
symbol,period_end,period_type,consolidated,revenue,expenses,operating_profit,other_income,depreciation,interest,pbt,tax,net_profit,eps
```

INR crore, EPS in INR. `period_type` is `Q` or `A`; `consolidated` is `1`/`0` (or `standalone`).
P/E (TTM) appears once a stock has four quarters of EPS on the same basis.

### `shareholding`

```
symbol,quarter_end,promoter,fii,dii,public,government,others,pledged_pct
```

Percent of total shares; `pledged_pct` is percent of promoter holding pledged.

## Split and bonus adjustment

The bhavcopy is unadjusted and its "previous close" isn't rebased on ex-dates. `jobs/adjustments.ts`
treats a one-day move beyond −35%/+60% (outside the ±20% circuit band) as a corporate action,
snaps it to the nearest standard ratio, and stores it in `price_adjustments`. Rows you add with
`source = 'manual'` are kept and win over detection — use them to fix a miss or a false positive.
