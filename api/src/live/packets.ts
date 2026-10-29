// Dhan live market feed (v2) wire format.
//
// Requests are JSON; responses are little-endian binary packets that all start
// with an 8-byte header:
//   0  u8     response code       (2 ticker, 4 quote, 5 OI, 6 prev close, 7 market status, 8 full, 50 disconnect)
//   1  i16    message length      (whole packet, header included)
//   3  u8     exchange segment    (0 IDX_I, 1 NSE_EQ, 2 NSE_FNO, 4 BSE_EQ, …)
//   4  i32    security id
// One WebSocket message may carry several packets back to back.

export const REQUEST = { subscribeQuote: 17, unsubscribeQuote: 18, disconnect: 12 } as const;

export const DISCONNECT_REASONS: Record<number, string> = {
  800: "Dhan internal error",
  804: "Too many instruments requested",
  805: "Too many connections or requests",
  806: "Data API subscription is not active",
  807: "Access token expired",
  808: "Authentication failed (client id or token)",
  809: "Access token invalid",
  810: "Client id invalid",
};

const SEGMENTS: Record<number, string> = { 0: "IDX_I", 1: "NSE_EQ", 2: "NSE_FNO", 3: "NSE_CURRENCY", 4: "BSE_EQ", 5: "MCX_COMM", 7: "BSE_CURRENCY", 8: "BSE_FNO" };

// Packet sizes, used when a header's length field is missing or implausible.
const SIZE: Record<number, number> = { 2: 16, 4: 50, 5: 12, 6: 16, 7: 8, 8: 162, 50: 10 };

export type LiveEvent =
  | { kind: "quote"; segment: string; securityId: string; ltp: number; ltq: number; ltt: number; atp: number; volume: number; sellQty: number; buyQty: number; open: number; close: number; high: number; low: number }
  | { kind: "ticker"; segment: string; securityId: string; ltp: number; ltt: number }
  | { kind: "prevClose"; segment: string; securityId: string; prevClose: number }
  | { kind: "marketStatus"; segment: string }
  | { kind: "disconnect"; code: number; reason: string };

/**
 * Dhan's "epoch" trade times are IST wall-clock seconds, not Unix time: the
 * live feed showed post-close trades (15:5x IST) as 21:2x when read as Unix
 * seconds. Subtract IST's offset so clients get real Unix seconds.
 */
export function normaliseTradeTime(epoch: number): number {
  return epoch ? epoch - 19_800 : 0;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function parsePackets(data: ArrayBuffer): LiveEvent[] {
  const view = new DataView(data);
  const events: LiveEvent[] = [];
  let at = 0;
  while (at + 8 <= view.byteLength) {
    const code = view.getUint8(at);
    const declared = view.getInt16(at + 1, true);
    const size = declared >= 8 && at + declared <= view.byteLength ? declared : SIZE[code];
    if (!size || at + size > view.byteLength) break; // truncated or unknown: stop rather than misread
    const segment = SEGMENTS[view.getUint8(at + 3)] ?? String(view.getUint8(at + 3));
    const securityId = String(view.getInt32(at + 4, true));
    const f32 = (o: number) => round2(view.getFloat32(at + o, true));
    const i32 = (o: number) => view.getInt32(at + o, true);

    switch (code) {
      case 4: // quote
        events.push({
          kind: "quote", segment, securityId,
          ltp: f32(8), ltq: view.getInt16(at + 12, true), ltt: normaliseTradeTime(i32(14)), atp: f32(18),
          volume: i32(22), sellQty: i32(26), buyQty: i32(30),
          open: f32(34), close: f32(38), high: f32(42), low: f32(46),
        });
        break;
      case 2: // ticker
        events.push({ kind: "ticker", segment, securityId, ltp: f32(8), ltt: normaliseTradeTime(i32(12)) });
        break;
      case 6: // previous day's close, sent once on subscribe
        events.push({ kind: "prevClose", segment, securityId, prevClose: f32(8) });
        break;
      case 7:
        events.push({ kind: "marketStatus", segment });
        break;
      case 50: {
        const reason = view.getInt16(at + 8, true);
        events.push({ kind: "disconnect", code: reason, reason: DISCONNECT_REASONS[reason] ?? `Disconnected by Dhan (code ${reason})` });
        break;
      }
      // 5 (OI) and 8 (full) aren't requested for equities; skip them.
    }
    at += size;
  }
  return events;
}

/** Quote-mode subscribe messages for NSE equities, 100 instruments each (Dhan's per-message cap). */
export function subscribeMessages(securityIds: string[], requestCode: number = REQUEST.subscribeQuote): string[] {
  const out: string[] = [];
  for (let i = 0; i < securityIds.length; i += 100) {
    const chunk = securityIds.slice(i, i + 100);
    out.push(JSON.stringify({
      RequestCode: requestCode,
      InstrumentCount: chunk.length,
      InstrumentList: chunk.map((id) => ({ ExchangeSegment: "NSE_EQ", SecurityId: id })),
    }));
  }
  return out;
}
