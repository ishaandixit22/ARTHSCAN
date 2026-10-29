// Browser side of live prices: one WebSocket to /api/live/stream shared by
// every component on the page. Components call watch([...symbols]) and read
// live.quotes[symbol]; the server only sends symbols someone is watching.

export type LiveQuote = {
  symbol: string; ltp: number; prevClose: number | null; change: number | null; changePct: number | null;
  open: number | null; high: number | null; low: number | null; volume: number | null; atp: number | null; ltt: number | null;
};
export type LiveStatus = { state: "idle" | "connecting" | "live" | "error" | "not_configured"; message: string; lastTickAt: number | null };

export const live = $state<{ quotes: Record<string, LiveQuote>; status: LiveStatus | null; connected: boolean }>({
  quotes: {},
  status: null,
  connected: false,
});

const watchers = new Map<number, string[]>();
let nextId = 1;
let socket: WebSocket | null = null;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

const wanted = () => [...new Set([...watchers.values()].flat())];

function sendSubscription() {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ subscribe: wanted() }));
}

function open() {
  if (socket || typeof window === "undefined") return;
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/live/stream`;
  const ws = new WebSocket(url);
  socket = ws;
  ws.onopen = () => {
    live.connected = true;
    retry = 0;
    sendSubscription();
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "quotes") Object.assign(live.quotes, msg.quotes);
    else if (msg.type === "status") live.status = msg.status;
  };
  ws.onclose = () => {
    live.connected = false;
    socket = null;
    // Reconnect while anything is still watching, backing off to 30s.
    if (watchers.size && !retryTimer) {
      retryTimer = setTimeout(() => ((retryTimer = null), open()), Math.min(30_000, 1000 * 2 ** retry++));
    }
  };
}

/** Start receiving live quotes for these symbols; call the returned function to stop. */
export function watch(symbols: string[]): () => void {
  const id = nextId++;
  watchers.set(id, symbols.map((s) => s.toUpperCase()));
  if (socket) sendSubscription();
  else open();
  return () => {
    watchers.delete(id);
    if (!watchers.size) {
      socket?.close();
      socket = null;
    } else sendSubscription();
  };
}

/** "14:32:05" in IST from Unix seconds. */
export const tradeTime = (sec: number | null) =>
  sec ? new Date(sec * 1000).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }) : "—";
