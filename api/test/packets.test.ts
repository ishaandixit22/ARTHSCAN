import { describe, expect, it } from "vitest";
import { normaliseTradeTime, parsePackets, subscribeMessages } from "../src/live/packets.js";

/** Builds a Dhan packet byte by byte, exactly as the docs lay it out. */
function packet(code: number, size: number, securityId: number, fill: (v: DataView) => void, segment = 1): Uint8Array {
  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  v.setUint8(0, code);
  v.setInt16(1, size, true);
  v.setUint8(3, segment);
  v.setInt32(4, securityId, true);
  fill(v);
  return new Uint8Array(buf);
}

const quote = (id: number, ltp: number) =>
  packet(4, 50, id, (v) => {
    v.setFloat32(8, ltp, true);
    v.setInt16(12, 25, true);
    v.setInt32(14, 1_793_250_000, true);
    v.setFloat32(18, 1441.2, true);
    v.setInt32(22, 1_234_567, true);
    v.setInt32(26, 50_000, true);
    v.setInt32(30, 60_000, true);
    v.setFloat32(34, 1420, true);
    v.setFloat32(38, 0, true);
    v.setFloat32(42, 1452.5, true);
    v.setFloat32(46, 1418.05, true);
  });

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) (out.set(p, at), (at += p.length));
  return out.buffer;
};

describe("Dhan packet parser", () => {
  it("decodes a quote packet field by field", () => {
    const [e] = parsePackets(concat(quote(2885, 1446.35)));
    expect(e).toMatchObject({
      kind: "quote", segment: "NSE_EQ", securityId: "2885", ltp: 1446.35, ltq: 25, atp: 1441.2,
      volume: 1_234_567, sellQty: 50_000, buyQty: 60_000, open: 1420, high: 1452.5, low: 1418.05,
    });
  });

  it("reads several packets in one message, including prev close and disconnect", () => {
    const prev = packet(6, 16, 11536, (v) => v.setFloat32(8, 2460, true));
    const bye = packet(50, 10, 0, (v) => v.setInt16(8, 807, true));
    const events = parsePackets(concat(prev, quote(11536, 2471.1), bye));
    expect(events.map((e) => e.kind)).toEqual(["prevClose", "quote", "disconnect"]);
    expect(events[0]).toMatchObject({ securityId: "11536", prevClose: 2460 });
    expect(events[2]).toMatchObject({ code: 807, reason: "Access token expired" });
  });

  it("stops at a truncated packet instead of misreading it", () => {
    const whole = quote(1333, 700);
    expect(parsePackets(concat(whole, whole.slice(0, 20)))).toHaveLength(1);
  });

  it("splits subscriptions into Dhan's 100-instrument messages", () => {
    const ids = Array.from({ length: 250 }, (_, i) => String(i + 1));
    const msgs = subscribeMessages(ids).map((m) => JSON.parse(m));
    expect(msgs.map((m) => m.InstrumentCount)).toEqual([100, 100, 50]);
    expect(msgs[0].RequestCode).toBe(17);
    expect(msgs[0].InstrumentList[0]).toEqual({ ExchangeSegment: "NSE_EQ", SecurityId: "1" });
  });

  it("converts Dhan's IST wall-clock trade times to Unix seconds, at any hour", () => {
    // 28 Oct 2026 15:59:59 IST as Dhan sends it (that wall-clock time read as UTC).
    const dhan = Date.UTC(2026, 9, 28, 15, 59, 59) / 1000;
    expect(new Date(normaliseTradeTime(dhan) * 1000).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false })).toBe("15:59:59");
    expect(normaliseTradeTime(0)).toBe(0);
  });
});
