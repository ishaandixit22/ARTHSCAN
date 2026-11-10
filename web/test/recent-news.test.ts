// Run with `npm test -w web`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recentNews } from "../src/lib/recent-news.ts";

const now = Date.parse("2026-11-08T12:00:00Z");
const item = (date: string | null) => ({ headline: "x", date });

describe("recentNews", () => {
  it("keeps news inside 30 days and drops older news", () => {
    const fresh = item("2026-11-07T12:30:24+0000");
    const edge = item("2026-10-09T12:00:00+0000");
    assert.deepEqual(recentNews([fresh, edge, item("2026-10-09T11:59:59+0000"), item("2026-07-22T01:00:00+0000")], now), [fresh, edge]);
  });
  it("keeps the provider's order, so the newest kept item stays first", () => {
    const a = item("2026-11-07T00:00:00+0000");
    const b = item("2026-11-01T00:00:00+0000");
    assert.deepEqual(recentNews([a, item("2026-01-01T00:00:00+0000"), b], now), [a, b]);
  });
  it("drops items with no readable date", () => {
    assert.deepEqual(recentNews([item(null), item(""), item("soon")], now), []);
  });
  it("copes with no news at all", () => {
    assert.deepEqual(recentNews(null, now), []);
    assert.deepEqual(recentNews(undefined, now), []);
  });
});
