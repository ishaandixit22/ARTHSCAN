// Run with `npm test -w web`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { needsSignIn, signInHref, usesFold } from "../src/lib/preview.ts";
import { pageSeo } from "../src/lib/seo.ts";

describe("what signed-out visitors can open", () => {
  it("opens calculators and the site's own pages in full", () => {
    for (const p of ["/", "/calculators", "/calculators/sip", "/about", "/contact", "/pricing", "/terms", "/privacy", "/developers", "/login"]) {
      assert.equal(usesFold(p), false, p);
      assert.equal(needsSignIn(p), false, p);
    }
  });
  it("previews every market page", () => {
    for (const p of ["/stocks", "/screener", "/screener/some-screen", "/sectors", "/sectors/Banks", "/heatmap", "/fii-dii", "/ipos", "/ipos/ABC", "/news", "/live", "/earnings", "/mutual-funds"]) {
      assert.equal(usesFold(p), true, p);
      assert.equal(needsSignIn(p), false, p);
    }
  });
  it("opens stock pages with their own gate, and the quote data they need", () => {
    assert.equal(usesFold("/stock/RELIANCE"), false);
    assert.equal(needsSignIn("/stock/RELIANCE"), false);
    assert.equal(needsSignIn("/stock/RELIANCE/desk"), false);
  });
  it("keeps account pages and deep stock data behind sign-in", () => {
    for (const p of ["/settings/tokens", "/connect/abc", "/stock/RELIANCE/chart", "/stock/RELIANCE/fundamentals", "/stock/RELIANCE/statements", "/stock/RELIANCE/filings"]) assert.equal(needsSignIn(p), true, p);
  });
  it("doesn't mistake a similar name for a private page", () => {
    assert.equal(needsSignIn("/settings-guide"), false);
    assert.equal(needsSignIn("/stock/SETTINGS"), false);
  });
  it("returns to the same page and filters after sign-in", () => {
    assert.equal(signInHref(new URL("https://arthscan.me/stocks?letter=B")), "/login?return_to=%2Fstocks%3Fletter%3DB");
  });
});

describe("search tags", () => {
  it("describes the home page and names the site", () => {
    const s = pageSeo("/");
    assert.equal(s.canonical, "https://arthscan.me/");
    assert.match(s.description!, /Arthscan/);
    assert.equal(s.noindex, false);
  });
  it("gives every public market page a description", () => {
    for (const p of ["/stocks", "/sectors", "/sectors/Banks", "/heatmap", "/fii-dii", "/live", "/breadth", "/signals", "/valuations", "/deliveries", "/deals", "/corporate-actions", "/board-meetings", "/earnings", "/events", "/filings", "/fo-ban", "/mutual-funds", "/commodities", "/news", "/developers", "/privacy", "/ipos/ABC"]) {
      assert.ok(pageSeo(p).description, p);
      assert.ok(pageSeo(p).description!.length <= 200, p);
    }
  });
  it("leaves pages that write their own tags alone", () => {
    assert.equal(pageSeo("/about").canonical, null);
    assert.equal(pageSeo("/about").description, null);
    assert.equal(pageSeo("/stock/RELIANCE").description, null);
    assert.equal(pageSeo("/stock/RELIANCE").canonical, "https://arthscan.me/stock/RELIANCE");
    assert.equal(pageSeo("/ipos").description, null);
    assert.equal(pageSeo("/screener/some-screen").description, null);
  });
  it("keeps sign-in and private pages out of search", () => {
    for (const p of ["/login", "/settings/tokens", "/connect/x", "/screener/custom"]) assert.equal(pageSeo(p).noindex, true, p);
    assert.equal(pageSeo("/stocks").noindex, false);
  });
  it("decodes names in descriptions", () => {
    assert.match(pageSeo("/sectors/Auto%20Components").description!, /^Auto Components stocks/);
  });
});
