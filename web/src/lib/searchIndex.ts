// The search box's company table: fetched once, on first focus, and matched in the browser.
// Rows arrive busiest first, so each match group below is already ranked. A plain scan of a few
// thousand rows takes well under a millisecond and also finds words inside a company's name,
// which a prefix tree couldn't.

export type SearchHit = { symbol: string; name: string; isin: string | null; close: number | null; change_pct: number | null };
// aka: the company's former tickers and names, so a search for an old one still finds it.
type Row = [symbol: string, name: string, isin: string | null, close: number | null, change_pct: number | null, aka?: string | null];

let rows: (Row & { upper?: string })[] | null = null;
let loading: Promise<void> | null = null;

export function loadSearchIndex(): Promise<void> {
  return (loading ??= fetch("/search-index.json")
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((body: { rows: Row[] }) => void (rows = body.rows.map((r) => Object.assign(r, { upper: `${r[1]} ${r[5] ?? ""}`.toUpperCase() }))))
    .catch(() => void (loading = null)));
}

/** Exact symbol, then symbols starting with the query (ISINs from six characters, as every ISIN opens alike), then names containing it. Null until the table has loaded. */
export function searchLocally(query: string, limit = 8): SearchHit[] | null {
  if (!rows) return null;
  const up = query.trim().toUpperCase();
  const exact: Row[] = [], starts: Row[] = [], inName: Row[] = [];
  for (const r of rows) {
    if (r[0] === up) exact.push(r);
    else if (r[0].startsWith(up) || (up.length >= 6 && r[2]?.startsWith(up))) starts.push(r);
    else if (r.upper!.includes(up)) inName.push(r);
  }
  return [...exact, ...starts, ...inName].slice(0, limit).map(([symbol, name, isin, close, change_pct]) => ({ symbol, name, isin, close, change_pct }));
}
