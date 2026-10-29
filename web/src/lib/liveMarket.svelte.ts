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
};

const POLL_MS = 15_000;

export const market = $state<{ data: LiveMarket | null; updatedAt: number | null }>({ data: null, updatedAt: null });

let users = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

async function poll() {
  timer = null;
  try {
    const res = await fetch("/api/live/market", { credentials: "same-origin" });
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

/** Start using live market data; call the returned function to stop. */
export function useLiveMarket(): () => void {
  users++;
  if (users === 1 && !timer) void poll();
  return () => {
    users--;
    if (users === 0 && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

/** True once live market data has arrived. */
export const isLiveMarket = () => market.data !== null;
