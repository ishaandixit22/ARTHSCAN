// LiveFeed — one Durable Object instance that owns the single connection to
// Dhan's live market feed and fans prices out to browsers.
//
//   Dhan ──binary ticks──▶ LiveFeed (latest quote per stock, in memory)
//                              │  once a second, only the stocks each viewer is watching
//                              ▼
//                   browsers on /api/live/stream (WebSocket)
//
// It connects on demand (first viewer or snapshot request), subscribes every
// traded NSE stock in quote mode (~3,500, under Dhan's 5,000-per-connection
// cap), and disconnects ten minutes after the last viewer leaves. Dhan tokens
// last 24 hours; an hourly alarm renews the stored token once it's 20 hours
// old. Access control happens in routes/live.ts before requests reach here.

import type { Env } from "../env.js";
import { parsePackets, REQUEST, subscribeMessages, type LiveEvent } from "./packets.js";

const DEFAULT_FEED_URL = "wss://api-feed.dhan.co";
const RENEW_URL = "https://api.dhan.co/v2/RenewToken";
const FLUSH_MS = 1_000;
const IDLE_DISCONNECT_MS = 10 * 60_000;
const ALARM_MS = 60_000;
const RENEW_AFTER_MS = 20 * 3600_000;
const MAX_SYMBOLS_PER_VIEWER = 300;
// Dhan says these won't fix themselves by retrying; wait for a new token or plan.
const FATAL_CODES = new Set([806, 807, 808, 809, 810]);

export type LiveQuote = {
  symbol: string; ltp: number; prevClose: number | null; change: number | null; changePct: number | null;
  open: number | null; high: number | null; low: number | null; volume: number | null; atp: number | null; ltt: number | null;
};

type FeedState = "idle" | "connecting" | "live" | "error" | "not_configured";
type Status = { state: FeedState; message: string; since: number; instruments: number; lastTickAt: number | null };
type Viewer = { symbols: string[] };

// Minimal shapes of the Workers runtime APIs used here (no workers-types dependency).
type DOState = {
  storage: { get<T>(k: string): Promise<T | undefined>; put(k: string, v: unknown): Promise<void>; setAlarm(t: number): Promise<void>; getAlarm(): Promise<number | null> };
  acceptWebSocket(ws: WebSocket): void;
  getWebSockets(): WebSocket[];
};
type AttachedSocket = WebSocket & { serializeAttachment(v: unknown): void; deserializeAttachment(): unknown };
declare const WebSocketPair: { new (): { 0: WebSocket; 1: WebSocket } };

const round2 = (n: number) => Math.round(n * 100) / 100;

export class LiveFeed {
  private upstream: WebSocket | null = null;
  private connecting: Promise<void> | null = null;
  private idToSymbol = new Map<string, string>();
  private eodClose = new Map<string, number>();
  private raw = new Map<string, Partial<Extract<LiveEvent, { kind: "quote" }>> & { prevClose?: number }>();
  private dirty = new Set<string>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private lastDemand = 0;
  private status: Status = { state: "idle", message: "Not connected", since: Date.now(), instruments: 0, lastTickAt: null };

  constructor(private state: DOState, private env: Env) {}

  // ── HTTP entry (called by routes/live.ts) ─────────────────────────

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.lastDemand = Date.now();
    await this.ensureAlarm();

    if (url.pathname.endsWith("/stream")) {
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response("Expected a WebSocket upgrade", { status: 426 });
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]] as [WebSocket, AttachedSocket];
      this.state.acceptWebSocket(server);
      server.serializeAttachment({ symbols: [] } satisfies Viewer);
      server.send(JSON.stringify({ type: "status", status: this.status }));
      void this.connect();
      return new Response(null, { status: 101, webSocket: client } as ResponseInit);
    }

    if (url.pathname.endsWith("/snapshot")) {
      const symbols = (url.searchParams.get("symbols") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, MAX_SYMBOLS_PER_VIEWER);
      await this.connect();
      // Give a fresh connection a moment to receive its first ticks.
      if (this.status.state === "live" && !this.status.lastTickAt) await new Promise((r) => setTimeout(r, 1500));
      return Response.json({ status: this.status, quotes: Object.fromEntries(symbols.map((s) => [s, this.quote(s)]).filter(([, q]) => q)) });
    }

    if (url.pathname.endsWith("/status")) {
      const token = await this.state.storage.get<{ setAt: number }>("token");
      return Response.json({ status: this.status, viewers: this.state.getWebSockets().length, tokenSetAt: token?.setAt ?? null });
    }

    if (url.pathname.endsWith("/token") && request.method === "POST") {
      const { token } = (await request.json().catch(() => ({}))) as { token?: string };
      if (!token || token.length < 20) return Response.json({ ok: false, error: "That doesn't look like a Dhan access token." }, { status: 400 });
      await this.state.storage.put("token", { value: token.trim(), setAt: Date.now() });
      this.disconnect("Token updated");
      this.setStatus("idle", "Token updated; reconnecting");
      await this.connect();
      return Response.json({ ok: true, status: this.status });
    }

    return new Response("Not found", { status: 404 });
  }

  // ── Viewer sockets (hibernation API) ──────────────────────────────

  webSocketMessage(ws: AttachedSocket, message: string | ArrayBuffer): void {
    if (typeof message !== "string") return;
    let msg: { subscribe?: unknown };
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    if (!Array.isArray(msg.subscribe)) return;
    const symbols = msg.subscribe.map((s) => String(s).toUpperCase()).slice(0, MAX_SYMBOLS_PER_VIEWER);
    ws.serializeAttachment({ symbols } satisfies Viewer);
    this.lastDemand = Date.now();
    void this.connect();
    const quotes = Object.fromEntries(symbols.map((s) => [s, this.quote(s)]).filter(([, q]) => q));
    ws.send(JSON.stringify({ type: "quotes", quotes }));
  }

  webSocketClose(ws: WebSocket): void {
    try {
      ws.close(1000, "bye");
    } catch {
      /* already closed */
    }
  }

  webSocketError(): void {}

  // ── Upstream connection to Dhan ───────────────────────────────────

  private async credentials(): Promise<{ token: string; clientId: string } | null> {
    const stored = await this.state.storage.get<{ value: string }>("token");
    const token = stored?.value ?? this.env.DHAN_ACCESS_TOKEN;
    const clientId = this.env.DHAN_CLIENT_ID;
    return token && clientId ? { token, clientId } : null;
  }

  private connect(): Promise<void> {
    if (this.upstream || this.connecting) return this.connecting ?? Promise.resolve();
    if (this.status.state === "error" && this.status.message.startsWith("Dhan:")) return Promise.resolve(); // fatal until token changes
    this.connecting = this.open().finally(() => (this.connecting = null));
    return this.connecting;
  }

  private async open(): Promise<void> {
    const creds = await this.credentials();
    if (!creds) {
      this.setStatus("not_configured", "Dhan client id or access token is not set");
      return;
    }
    await this.loadInstruments();
    if (!this.idToSymbol.size) {
      this.setStatus("error", "No stocks have Dhan ids yet; run the stocks pipeline job and sync");
      return;
    }

    this.setStatus("connecting", "Connecting to Dhan");
    const base = (this.env.DHAN_FEED_URL || DEFAULT_FEED_URL).replace(/^wss:/, "https:").replace(/^ws:/, "http:");
    const url = `${base}${base.includes("?") ? "&" : "?"}${new URLSearchParams({ version: "2", token: creds.token, clientId: creds.clientId, authType: "2" })}`;
    let ws: WebSocket | null;
    try {
      const res = await fetch(url, { headers: { Upgrade: "websocket" } });
      ws = (res as Response & { webSocket?: WebSocket | null }).webSocket ?? null;
      if (!ws) {
        this.setStatus("error", `Dhan refused the connection (HTTP ${res.status})`);
        return;
      }
    } catch (err) {
      this.setStatus("error", `Could not reach Dhan: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    (ws as WebSocket & { accept(): void }).accept();
    this.upstream = ws;
    ws.addEventListener("message", (e) => this.onUpstream((e as MessageEvent).data));
    ws.addEventListener("close", (e) => this.onUpstreamClosed((e as CloseEvent).code, (e as CloseEvent).reason));
    ws.addEventListener("error", () => this.onUpstreamClosed(1006, "connection error"));

    for (const msg of subscribeMessages([...this.idToSymbol.keys()])) ws.send(msg);
    this.status = { state: "live", message: "Live from Dhan", since: Date.now(), instruments: this.idToSymbol.size, lastTickAt: null };
    this.broadcastStatus();
  }

  private async loadInstruments(): Promise<void> {
    const { results } = await this.env.DB.prepare(`
      SELECT s.symbol, s.dhan_security_id AS id, m.close FROM stocks s JOIN stock_metrics m ON m.symbol = s.symbol
      WHERE s.dhan_security_id IS NOT NULL ORDER BY m.turnover DESC LIMIT 5000`).all<{ symbol: string; id: string; close: number }>();
    this.idToSymbol = new Map(results.map((r) => [r.id, r.symbol]));
    this.eodClose = new Map(results.map((r) => [r.symbol, r.close]));
  }

  private async onUpstream(data: unknown): Promise<void> {
    const buf = data instanceof ArrayBuffer ? data : data instanceof Blob ? await data.arrayBuffer() : null;
    if (!buf) return;
    for (const e of parsePackets(buf)) {
      if (e.kind === "disconnect") {
        this.setStatus("error", `Dhan: ${e.reason}`);
        this.disconnect(e.reason);
        continue;
      }
      if (e.kind === "marketStatus") continue;
      const symbol = this.idToSymbol.get(e.securityId);
      if (!symbol) continue;
      const cur = this.raw.get(symbol) ?? {};
      if (e.kind === "prevClose") cur.prevClose = e.prevClose;
      else if (e.kind === "ticker") Object.assign(cur, { ltp: e.ltp, ltt: e.ltt });
      else Object.assign(cur, e);
      this.raw.set(symbol, cur);
      this.dirty.add(symbol);
      this.status.lastTickAt = Date.now();
    }
    this.scheduleFlush();
  }

  private onUpstreamClosed(code: number, reason: string): void {
    if (!this.upstream) return;
    this.upstream = null;
    if (this.status.state !== "error") this.setStatus("idle", `Disconnected (${code}${reason ? `: ${reason}` : ""})`);
    // Reconnect only if someone is still watching; fatal Dhan errors wait for a new token.
    if (this.state.getWebSockets().length && this.status.state !== "error") setTimeout(() => void this.connect(), 5_000);
  }

  private disconnect(reason: string): void {
    const ws = this.upstream;
    this.upstream = null;
    if (!ws) return;
    try {
      ws.send(JSON.stringify({ RequestCode: REQUEST.disconnect }));
      ws.close(1000, reason.slice(0, 100));
    } catch {
      /* already gone */
    }
  }

  // ── Quotes and fan-out ────────────────────────────────────────────

  private quote(symbol: string): LiveQuote | null {
    const r = this.raw.get(symbol);
    if (!r?.ltp) return null;
    const prev = r.prevClose ?? this.eodClose.get(symbol) ?? null;
    const change = prev ? round2(r.ltp - prev) : null;
    return {
      symbol, ltp: r.ltp, prevClose: prev, change, changePct: prev && change !== null ? round2((change / prev) * 100) : null,
      open: r.open || null, high: r.high || null, low: r.low || null, volume: r.volume ?? null, atp: r.atp || null, ltt: r.ltt || null,
    };
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      const changed = this.dirty;
      this.dirty = new Set();
      for (const ws of this.state.getWebSockets() as AttachedSocket[]) {
        const viewer = ws.deserializeAttachment() as Viewer | null;
        const wanted = (viewer?.symbols ?? []).filter((s) => changed.has(s));
        if (!wanted.length) continue;
        const quotes = Object.fromEntries(wanted.map((s) => [s, this.quote(s)]).filter(([, q]) => q));
        try {
          ws.send(JSON.stringify({ type: "quotes", quotes }));
        } catch {
          /* viewer went away */
        }
      }
    }, FLUSH_MS);
  }

  private setStatus(state: FeedState, message: string): void {
    this.status = { ...this.status, state, message, since: Date.now() };
    this.broadcastStatus();
  }

  private broadcastStatus(): void {
    const msg = JSON.stringify({ type: "status", status: this.status });
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(msg);
      } catch {
        /* ignore */
      }
    }
  }

  // ── Housekeeping: idle disconnect + token renewal ─────────────────

  private async ensureAlarm(): Promise<void> {
    if (!(await this.state.storage.getAlarm())) await this.state.storage.setAlarm(Date.now() + ALARM_MS);
  }

  async alarm(): Promise<void> {
    const watching = this.state.getWebSockets().length > 0;
    if (this.upstream && !watching && Date.now() - this.lastDemand > IDLE_DISCONNECT_MS) {
      this.disconnect("idle");
      this.setStatus("idle", "Disconnected: nobody watching");
    }
    await this.renewTokenIfDue();
    if (this.upstream || watching) await this.state.storage.setAlarm(Date.now() + ALARM_MS);
  }

  private async renewTokenIfDue(): Promise<void> {
    const stored = await this.state.storage.get<{ value: string; setAt: number }>("token");
    const creds = await this.credentials();
    if (!creds) return;
    const setAt = stored?.setAt ?? 0;
    if (stored && Date.now() - setAt < RENEW_AFTER_MS) return;
    try {
      const res = await fetch(RENEW_URL, { headers: { "access-token": creds.token, dhanClientId: creds.clientId } });
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      const fresh = body && (body.accessToken ?? body.token ?? (body.data as Record<string, unknown> | undefined)?.accessToken);
      if (res.ok && typeof fresh === "string" && fresh.length > 20) {
        await this.state.storage.put("token", { value: fresh, setAt: Date.now() });
      } else {
        // Keep the current token and retry in an hour; Dhan reports 807 when it truly expires.
        await this.state.storage.put("token", { value: creds.token, setAt: Date.now() - RENEW_AFTER_MS + 3600_000 });
      }
    } catch {
      /* try again next alarm */
    }
  }
}
