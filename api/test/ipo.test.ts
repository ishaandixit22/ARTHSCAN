import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { migrate, SqliteDatabase } from "../src/db/sqlite.js";
import type { Env } from "../src/env.js";
import { addWorkingDays, anchorDates, costs, isoDate, parseCategories, priceBand, profitPerLot, retailOdds } from "../src/lib/ipo.js";

const db = new SqliteDatabase(":memory:");
const env: Env = { DB: db, PUBLIC_SITE_ORIGIN: "https://arthscan.me", TOKEN_PEPPER: "p", INTERNAL_API_KEY: "i", FREE_DAILY_QUOTA: "50" };
beforeAll(() => migrate(db));
afterEach(() => vi.unstubAllGlobals());

describe("IPO maths", () => {
  it("reads NSE dates and price bands", () => {
    expect(isoDate("29-Oct-2026")).toBe("2026-10-29");
    expect(priceBand("Rs.78 to Rs.82")).toEqual({ low: 78, high: 82 });
    expect(priceBand("Rs. 1,078/- to Rs. 1,134/- per Equity Share")).toEqual({ low: 1078, high: 1134 });
    expect(priceBand("Rs.100")).toEqual({ low: 100, high: 100 });
  });

  it("works out the lot cost and the smallest bid for each bracket", () => {
    // 182 shares × ₹82 = ₹14,924: retail fits 13 lots under ₹2 lakh, sNII starts at 14, bNII at 68 (>₹10 lakh).
    expect(costs(182, 82)).toEqual({
      lot_size: 182, lot_cost: 14924, retail_max_lots: 13, retail_max_cost: 194012,
      snii_min_lots: 14, snii_min_cost: 208936, snii_max_lots: 67, snii_max_cost: 999908, bnii_min_lots: 68, bnii_min_cost: 1014832,
    });
    // A lot dearer than ₹2 lakh still counts as one lot for retail.
    expect(costs(100, 5000)?.retail_max_lots).toBe(1);
    expect(costs(null, 82)).toBeNull();
  });

  it("estimates the retail chance as lots on offer over lots bid, never above 100%", () => {
    expect(retailOdds(8_214_097, 10_201_282, 182)).toEqual({ lots_offered: 45132, lots_bid: 56051, chance: 0.805 });
    expect(retailOdds(1000, 400, 100)?.chance).toBe(1);
    expect(retailOdds(null, 400, 100)).toBeNull();
  });

  it("skips weekends for the allotment date and adds 30 and 90 days for the anchor lock-ins", () => {
    expect(addWorkingDays("2026-10-30", 2)).toBe("2026-11-03"); // Friday → Tuesday
    expect(addWorkingDays("2026-10-30", 2, ["2026-11-02"])).toBe("2026-11-04"); // a Monday holiday pushes it a day
    // Close Monday 2 Nov: allotment Tue, refund and demat Wed, listing Thu (T+1, T+2, T+3).
    expect(anchorDates("2026-11-02")).toEqual({ allotment_est: "2026-11-03", refund_est: "2026-11-04", demat_est: "2026-11-04", listing_est: "2026-11-05", lockin_50pct: "2026-12-03", lockin_rest: "2027-02-01" });
    // Close Thursday 29 Oct (BLS Polymers): allotment Fri, refund and listing after the weekend, as on Tapetide.
    expect(anchorDates("2026-10-29")).toMatchObject({ allotment_est: "2026-10-30", refund_est: "2026-11-02", listing_est: "2026-11-03" });
    expect(anchorDates(null)).toBeNull();
  });

  it("turns a premium into profit per lot, and says nothing without one", () => {
    expect(profitPerLot(40, 100)).toBe(4000);
    expect(profitPerLot(-5, 182)).toBe(-910);
    expect(profitPerLot(null, 100)).toBeNull();
  });

  it("reads the category table with demand in rupees at the upper band", () => {
    const cats = parseCategories([
      { category: "QIB", srNo: "1", noOfShareOffered: "4798588", noOfSharesBid: "31452876", noOfTotalMeant: "6.55461064796561" },
      { category: "FII", srNo: "1(a)", noOfShareOffered: "", noOfSharesBid: "0", noOfTotalMeant: "" },
      { category: "Retail", srNo: "3", noOfShareOffered: "8214097", noOfSharesBid: "10201282", noOfTotalMeant: "1.241923731847822" },
      { category: "Total", srNo: null, noOfShareOffered: "1.6533012E7", noOfSharesBid: "4.419506E7", noOfTotalMeant: "2.6731402602260252" },
    ], 82);
    expect(cats.map((c) => c.key)).toEqual(["qib", "retail", "total"]);
    expect(cats[1]).toMatchObject({ times: 1.24, demand_cr: 83.65 });
    expect(cats[2]).toMatchObject({ times: 2.67, demand_cr: 362.4 });
  });
});

const CURRENT = [
  { companyName: "Bombay Coated and Special Steels Limited", issueEndDate: "02-Nov-2026", issuePrice: "Rs.78 to Rs.82", issueStartDate: "29-Oct-2026", series: "EQ", status: "Active", symbol: "BCSSL" },
  { companyName: "BLS Polymers Limited", issueEndDate: "29-Oct-2026", issuePrice: "Rs.142 to Rs.150", issueStartDate: "27-Oct-2026", series: "EQ", status: "Closed", symbol: "BLSPOLY" },
];
const UPCOMING = [...CURRENT, { companyName: "Vedant Poly Fabs Limited", issueEndDate: "04-Nov-2026", issuePrice: "Rs.88 to Rs.94", issueStartDate: "02-Nov-2026", lotSize: "1200", series: "SME", status: "Forthcoming", symbol: "VPFL" }];
const DETAIL = {
  activeCat: { updateTime: "Updated as on 29-Oct-2026 17:00:00", dataList: [
    { category: "Retail", srNo: "3", noOfShareOffered: "8214097", noOfSharesBid: "10201282", noOfTotalMeant: "1.24" },
    { category: "Total", srNo: null, noOfShareOffered: "1.6533012E7", noOfSharesBid: "4.419506E7", noOfTotalMeant: "2.67" },
  ] },
  issueInfo: { dataList: [
    { title: "Price Range", value: "Rs. 78/- to Rs. 82/- per Equity Share" }, { title: "Bid Lot", value: "182 Equity Shares and in multiples thereof" },
    { title: "Red Herring Prospectus", value: "https://nsearchives.nseindia.com/content/ipo/RHP_BCSSL.zip" },
  ] },
};

describe("get_ipo_board over the API", () => {
  it("joins the live issues with their category tables and lists the ones still to open", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("ipo-current-issue")) return new Response(JSON.stringify(CURRENT));
      if (url.includes("all-upcoming-issues")) return new Response(JSON.stringify(UPCOMING));
      if (url.includes("symbol=BCSSL")) return new Response(JSON.stringify(DETAIL));
      return new Response("<html>Access Denied</html>", { status: 403 }); // BLSPOLY's detail fails: the board must still come back
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await app.fetch(new Request("https://x/v1/market/ipo-board", { headers: { "x-internal-key": "i" } }), env);
    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    const [bcssl, bls] = body.data.open;
    expect(bcssl).toMatchObject({ symbol: "BCSSL", status: "open", price_high: 82, times_total: 2.67, demand_cr: 362.4, gmp: null, profit_per_lot: null });
    expect(bcssl.costs.lot_cost).toBe(14924);
    expect(bcssl.retail_odds.chance).toBe(0.805);
    expect(bcssl.dates.allotment_est).toBe("2026-11-03");
    expect(bcssl.rhp_url).toContain("RHP_BCSSL");
    expect(bls).toMatchObject({ symbol: "BLSPOLY", status: "closed", subscription: [], costs: null });
    expect(body.data.upcoming.map((u: any) => u.symbol)).toEqual(["VPFL"]);
    expect(body.data.upcoming[0].costs.lot_cost).toBe(112800);
  });
});

describe("grey-market premium from ipoalerts", () => {
  const hours = (prices: number[]) => ({ symbol: "BCSSL", series: prices.map((price, i) => ({ timestamp: `2026-10-29T${String(i % 24).padStart(2, "0")}:00:00.000Z`, price })) });

  it("takes the latest hourly point and the change over a day, and nothing for an issue with no series", async () => {
    const { parseTrend } = await import("../src/lib/ipoalerts.js");
    const day = Array.from({ length: 30 }, (_, i) => (i < 6 ? 5 : 8)); // 30 hours: 5 → 8
    expect(parseTrend("bcssl", hours(day))).toMatchObject({ symbol: "BCSSL", gmp: 8, change_24h: 3, history: day.slice(-24) });
    expect(parseTrend("BCSSL", hours([6, 7]))).toMatchObject({ gmp: 7, change_24h: 1 });
    expect(parseTrend("MKSONS", { series: [] })).toBeNull();
    const { lastPerDay } = await import("../src/lib/ipoalerts.js");
    // 22:30 IST on the 28th is 17:00 UTC; 01:00 IST on the 29th is 19:30 UTC on the 28th, so it belongs to the 29th.
    expect(lastPerDay([{ timestamp: "2026-10-28T10:00:00Z", price: 1 }, { timestamp: "2026-10-28T17:00:00Z", price: 2 }, { timestamp: "2026-10-28T19:30:00Z", price: 3 }]))
      .toEqual([{ timestamp: "2026-10-28T00:00:00.000Z", price: 2 }, { timestamp: "2026-10-29T00:00:00.000Z", price: 3 }]);
    // Shortly after midnight India time, a "today" row that only repeats yesterday's reading is left out.
    const repeat = [{ timestamp: "2026-10-29T16:00:00Z", price: 68 }, { timestamp: "2026-10-29T19:00:00Z", price: 68 }];
    expect(lastPerDay(repeat, Date.parse("2026-10-29T20:00:00Z"))).toHaveLength(1);
    expect(lastPerDay(repeat, Date.parse("2026-10-31T06:00:00Z"))).toHaveLength(2);
  });

  it("puts premium, percentage, implied price and profit per lot on the board, and says why when the provider refuses", async () => {
    const keyed = { ...env, IPOALERTS_API_KEY: "test-key" } as Env;
    const ask = async () => ((await (await app.fetch(new Request("https://x/v1/market/ipo-board", { headers: { "x-internal-key": "i" } }), keyed)).json()) as any).data;
    let alerts = () => new Response(JSON.stringify(hours([8])));
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("api.ipoalerts.in")) {
        expect((init?.headers as any)["x-api-key"]).toBe("test-key");
        return url.includes("/BCSSL/") ? alerts() : new Response(JSON.stringify({ series: [] })); // BLSPOLY has no premium
      }
      if (url.includes("ipo-current-issue")) return new Response(JSON.stringify(CURRENT));
      if (url.includes("all-upcoming-issues")) return new Response(JSON.stringify(UPCOMING));
      if (url.includes("symbol=BCSSL")) return new Response(JSON.stringify(DETAIL));
      return new Response("nope", { status: 403 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await db.prepare("DELETE FROM external_cache").run();
    let d = await ask();
    expect(d.open[0]).toMatchObject({ symbol: "BCSSL", gmp: 8, gmp_pct: 9.8, est_listing: 90, profit_per_lot: 1456 }); // 8 × 182
    expect(d.open[1].gmp).toBeNull();
    expect(d.gmp).toMatchObject({ connected: true, error: null });
    const calls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes("ipoalerts")).length;
    const before = calls();
    await ask();
    expect(calls()).toBe(before); // reused inside the window
    await db.prepare("UPDATE external_cache SET fetched_at = fetched_at - 99999 WHERE key = 'ipoalerts:gmp'").run();
    alerts = () => new Response("{}", { status: 429 });
    d = await ask();
    expect(d.open[0].gmp).toBe(8); // the stored premium keeps showing
    expect(d.gmp.error).toMatch(/limit/);
  });
});

describe("get_ipo_detail, checked against BLS Polymers' published page", () => {
  const rows = (offered: string, bid: string, times: string, sr: string, category: string) => ({ category, srNo: sr, noOfShareOffered: offered, noOfSharesBid: bid, noOfTotalMeant: times });
  const BLS = {
    activeCat: { updateTime: "Updated as on 29-Oct-2026 17:40:00", dataList: [
      rows("3400000", "680857700", "200.25", "1", "QIB"),
      rows("2550000", "1425967100", "559.20", "2", "NII"),
      rows("1700000", "1007815300", "592.83", "2.1", "bNII"),
      rows("850000", "418151800", "491.94", "2.2", "sNII"),
      rows("5950000", "763725200", "128.36", "3", "Retail"),
      { category: "Total", srNo: null, noOfShareOffered: "1.19E7", noOfSharesBid: "2.870550E9", noOfTotalMeant: "241.22" },
    ] },
    issueInfo: { dataList: [
      { title: "Issue Period", value: "27-Oct-2026 to 29-Oct-2026" }, { title: "Price Range", value: "Rs. 142/- to Rs. 150/- per Equity Share" }, { title: "Bid Lot", value: "100 Equity Shares" },
      { title: "Issue Size", value: "Fresh Issue aggregating upto Rs. 2,550 million (including Anchor reservation portion of 51,00,000 Equity Shares)" },
      { title: "Face Value", value: "Rs. 10 per Equity Share" }, { title: "Name of the Registrar", value: "Kfin Technologies Ltd." },
    ] },
  };
  // Hourly readings: the 28th closes at ₹51 (it was ₹45 earlier that day), the 29th at ₹68.
  const hourly = { series: [{ timestamp: "2026-10-28T10:00:00.000Z", price: 45 }, { timestamp: "2026-10-28T17:00:00.000Z", price: 51 }, { timestamp: "2026-10-29T16:50:00.000Z", price: 68 }] };
  const stub = () => vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("api.ipoalerts.in")) {
      if (url.includes("/gmp")) return new Response(JSON.stringify(hourly));
      return new Response(JSON.stringify({ ipo: { symbol: "BLSPOLY", logo: "https://x/logo.png", about: "Polymer compounds.", strengths: ["Repeat customers"], risks: ["Customer concentration"], issueSize: "255cr", listingDate: "2026-11-03", prospectusUrl: "https://sebi/rhp" } }));
    }
    if (url.includes("ipo-current-issue")) return new Response(JSON.stringify([{ ...CURRENT[1], symbol: "BLSPOLY", status: "Closed" }]));
    if (url.includes("all-upcoming-issues")) return new Response("[]");
    if (url.includes("ipo-detail?symbol=BLSPOLY")) return new Response(JSON.stringify(BLS));
    if (url.includes("holiday-master")) return new Response(JSON.stringify({ CM: [] }));
    return new Response("nope", { status: 403 });
  }));
  const ask = async (q: string) => {
    const res = await app.fetch(new Request(`https://x/v1/market/ipo-detail?${q}`, { headers: { "x-internal-key": "i" } }), { ...env, IPOALERTS_API_KEY: "k" } as Env);
    return { status: res.status, body: (await res.json()) as any };
  };

  it("reproduces the page's numbers: bids in ₹ Cr, reservation split, lot brackets, timetable and premium rows", async () => {
    stub();
    await db.prepare("DELETE FROM external_cache").run();
    const { status, body } = await ask("symbol=blspoly");
    expect(status).toBe(200);
    const d = body.data;
    expect(d).toMatchObject({ symbol: "BLSPOLY", status: "closed", price_high: 150, times_total: 241.22, cut_off_cost: 15000, issue_size_cr: 255, logo: "https://x/logo.png" });
    const bid = Object.fromEntries(d.subscription.map((r: any) => [r.key, r]));
    expect(bid.qib.times).toBe(200.25);
    expect(Math.round(bid.qib.bid_cr)).toBe(10213); // 68,08,57,700 × ₹150 = ₹10,213 Cr, as the page rounds it
    expect(Math.round(bid.retail.bid_cr)).toBe(11456);
    expect(bid.bnii.within).toBe("nii");
    // Reservation: 34,00,000 QIB of a 1,19,00,000 net offer is 28.57%; the anchor's 51,00,000 sits on top.
    const r = Object.fromEntries(d.reservation.rows.map((x: any) => [x.key, x]));
    expect(r.qib).toMatchObject({ shares: 3400000, pct_net: 28.57 });
    expect(r.retail.pct_net).toBe(50);
    expect(r.anchor).toMatchObject({ shares: 5100000, within: "qib" });
    expect(d.reservation.total).toBe(17000000);
    // Application sizes: retail 1–13 lots, sNII 14–66, bNII from 67 (₹10.05 lakh).
    expect(d.application).toMatchObject({ retail_max_lots: 13, snii_min_lots: 14, snii_max_lots: 66, bnii_min_lots: 67 });
    expect(d.anchor).toMatchObject({ shares: 5100000, amount_cr: 76.5, lockin_50pct: "2026-11-29", lockin_rest: "2027-01-28" });
    // Timetable: close Thu 29 Oct → allotment Fri 30 Oct, refund/demat Mon 2 Nov, listing Tue 3 Nov.
    expect(d.dates).toMatchObject({ allotment: "2026-10-30", refund: "2026-11-02", demat: "2026-11-02", listing: "2026-11-03" });
    expect(d.gmp).toMatchObject({ latest: 68, pct: 45.33, est_listing: 218, profit_per_lot: 6800, range: [51, 68] });
    expect(d.gmp.days[0]).toEqual({ date: "2026-10-29", gmp: 68, pct: 45.33, est_listing: 218, gain_per_lot: 6800 });
    expect(d.facts).toMatchObject({ face_value: "Rs. 10 per Equity Share", registrar: "Kfin Technologies Ltd.", fresh_issue_cr: 255 });
    expect(d.markdown).toContain("QIB | 34,00,000 | 68,08,57,700 | 10212.87 | 200.25× |");
    expect(d.about).toBe("Polymer compounds.");
  });

  it("rejects a malformed symbol and reports an unknown one", async () => {
    stub();
    expect((await ask("symbol=")).status).toBe(400);
    expect((await ask("symbol=ZZZZZ")).status).toBe(404);
  });
});
