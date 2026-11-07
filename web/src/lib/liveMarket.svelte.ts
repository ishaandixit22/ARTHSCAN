// Market-wide live views (movers, breadth, sector moves, intraday signals) for
// accounts with live access. One poll of /api/live/market every 15 seconds,
// shared by every component on the page; stops when nothing is using it.
// Pages keep showing the end-of-day figures until (and unless) this fills in.

export type LiveStock = {
  symbol: string; name: string; sector: string; ltp: number; change_pct: number; volume: number | null;
  turnover: number; vol_ratio: number | null; high_52w: number | null; low_52w: number | null;
};
export type LiveMarket = {
  status: { state: string; message: string; lastTickAt: number | null };
  eod_as_of: string | null;
  stocks: number;
  breadth: { advances: number; declines: number; unchanged: number; at_52w_high: number; at_52w_low: number; turnover_cr: number };
  movers: { gainers: LiveStock[]; losers: LiveStock[]; active: LiveStock[] };
  signals: { volume_spike: LiveStock[]; breakout_high: LiveStock[]; breakout_low: LiveStock[] };
  sectors: { sector: string; stocks: number; median_change: number | null }[];
  indices: { index_name: string; ltp: number; prev_close: number | null; change_pct: number | null }[];
};

const POLL_MS = 15_000;

export const market = $state<{ data: LiveMarket | null; updatedAt: number | null }>({ data: null, updatedAt: null });

let users = 0;
let signalUsers = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

async function poll() {
  timer = null;
  // Nobody is looking: wait for the next turn rather than spend the phone's data and battery.
  if (document.hidden) {
    if (users > 0) timer = setTimeout(poll, POLL_MS);
    return;
  }
  try {
    const res = await fetch(signalUsers ? "/api/live/market" : "/api/live/market?lite=1", { credentials: "same-origin" });
    if (res.ok) {
      const body = (await res.json()) as LiveMarket;
      // An empty snapshot (feed down, or nothing ticked yet) keeps the page on end-of-day data.
      market.data = body.stocks > 0 ? body : null;
      market.updatedAt = Date.now();
    }
  } catch {
    /* keep the last good snapshot */
  }
  if (users > 0) timer = setTimeout(poll, POLL_MS);
}

/** Start using live market data; `signals` also asks for the long lists. Call the returned function to stop. */
export function useLiveMarket({ signals = false } = {}): () => void {
  users++;
  if (signals) signalUsers++;
  if (signals && timer) clearTimeout(timer), (timer = null); // what's held may be the short answer
  if ((users === 1 || signals) && !timer) void poll();
  return () => {
    users--;
    if (signals) signalUsers--;
    if (users === 0 && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

/** True once live market data has arrived. */
export const isLiveMarket = () => market.data !== null;
