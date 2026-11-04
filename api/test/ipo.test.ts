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

describe("IPO Guru", () => {
  const ROW = { slug: "maxwell-engineering-solutions-sme-ipo", name: "Maxwell Engineering Solutions", display_name: "Maxwell Engineering Solutions", type: "SME", sub_type: "NSE SME", status: "Open", stage: "live", dates_tba: false, is_listed: false, logo: "https://x/l.webp", open_date: "2026-10-30", close_date: "2026-11-03", allotment_date: "2026-11-04", listing_date: "2026-11-06", price_min: 150, price_max: 158, issue_price: "158", issue_size: "57.64", lot_size: 800, min_investment: 126400, gmp: { price: "80", percentage: "50.63", kostak: null, subject_to_sauda: "48600", estimated_listing_price: 238, updated_at: "2026-11-02T19:06:14.000000Z" }, subscription_total: "72.97", listing_price: null, listing_gain_percent: null, cmp: null, current_gain_percent: null, web_url: "https://www.ipoguru.in/ipo/x" };
  const ok = (data: unknown, plan = "free", remaining = "9") => new Response(JSON.stringify({ success: true, plan, data }), { headers: { "x-plan": plan, "x-ratelimit-limit": "10", "x-ratelimit-remaining": remaining } });
  const keyed = { ...env, IPOGURU_API_KEY: "k" } as Env;
  const clean = async () => { await db.prepare("DELETE FROM external_cache").run(); await db.prepare("DELETE FROM ipo_readings").run(); };

  it("treats a premium of 0 as a reading and null as unknown, and reads messy sauda figures", async () => {
    const { parseGmp, sameCompany, toNum } = await import("../src/lib/ipoguru.js");
    expect(parseGmp({ price: "0", percentage: "0" })).toMatchObject({ price: 0, pct: 0 });
    expect(parseGmp({ price: null }).price).toBeNull();
    expect(parseGmp({ subject_to_sauda: "700,,9800" }).sauda).toBe(700);
    expect(parseGmp({ subject_to_sauda: "13,700" }).sauda).toBe(13700);
    expect(toNum("")).toBeNull();
    expect(sameCompany("M.K.Sons Fine Jewels", "M K Sons Fine Jewels Limited")).toBe(true);
    expect(sameCompany("HGS (India)", "HGS India Limited")).toBe(true);
    expect(sameCompany("Maxwell Engineering", "Vectras Enprocon")).toBe(false);
  });

  it("works out each stage from the dates", async () => {
    const { stageOf } = await import("../src/handlers/ipo.js");
    const r = { pre_rhp: false, listed: false, open: "2026-10-30", close: "2026-11-03", allotment: "2026-11-04", listing: "2026-11-06" };
    expect(stageOf(r, "2026-10-29")).toBe("upcoming");
    expect(stageOf(r, "2026-11-02")).toBe("open");
    expect(stageOf(r, "2026-11-03")).toBe("closing");
    expect(stageOf(r, "2026-11-05")).toBe("allotted");
    expect(stageOf(r, "2026-11-06")).toBe("listed");
    expect(stageOf({ ...r, pre_rhp: true, open: null }, "2026-11-02")).toBe("expected");
  });

  it("spends one request per window, keeps a free key's reserve, and serves the stored copy when it is refused", async () => {
    const { calendar, quota } = await import("../src/lib/ipoguru.js");
    await clean();
    let answer = () => ok([ROW]);
    const fetchMock = vi.fn(async () => answer());
    vi.stubGlobal("fetch", fetchMock);
    expect((await calendar(keyed)).rows[0]).toMatchObject({ slug: ROW.slug, times_total: 72.97, price_high: 158 });
    await calendar(keyed);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await quota(keyed)).remaining).toBe(9);
    // Stale, but inside the minute: no second request.
    await db.prepare("UPDATE external_cache SET fetched_at = fetched_at - 99999 WHERE key LIKE 'ipoguru:/%'").run();
    expect((await calendar(keyed)).rows).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // A minute on, a 429 still shows the stored rows.
    await db.prepare("UPDATE external_cache SET body = json_set(body, '$.retry_at', 0) WHERE key = 'ipoguru:quota'").run();
    answer = () => new Response("{}", { status: 429, headers: { "retry-after": "30" } });
    const r = await calendar(keyed);
    expect(r.rows).toHaveLength(1);
    expect(r.error).toMatch(/limit/);
    // Down to the reserve: a stored copy is good enough, so nothing is spent.
    await db.prepare("UPDATE external_cache SET body = json_set(body, '$.retry_at', 0, '$.remaining', 2) WHERE key = 'ipoguru:quota'").run();
    const before = fetchMock.mock.calls.length;
    expect((await calendar(keyed)).error).toMatch(/quota/);
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it("takes the higher subscription figure, and treats a provider zero after day one as unknown", async () => {
    const { creditedTimes, useExchange } = await import("../src/handlers/ipo.js");
    expect(useExchange(80.34, 72.97)).toBe(true);
    expect(useExchange(2.67, 60.77)).toBe(false); // a stored NSE copy from days ago
    expect(useExchange(0, 72.97)).toBe(false);
    expect(useExchange(null, 1)).toBe(false);
    expect(creditedTimes(0, "2026-10-30", "2026-11-03")).toBeNull();
    expect(creditedTimes(0, "2026-11-03", "2026-11-03")).toBe(0); // the first morning really can be zero
    expect(creditedTimes(1.29, "2026-10-30", "2026-11-03")).toBe(1.29);
  });

  it("records a reading only when the premium or subscription changes", async () => {
    const { recordReadings, readings, parseCalendarRow } = await import("../src/lib/ipoguru.js");
    await clean();
    const row = parseCalendarRow(ROW);
    await recordReadings(keyed, [row], 1_000_000);
    await recordReadings(keyed, [row], 2_000_000);
    await recordReadings(keyed, [{ ...row, gmp: { ...row.gmp, price: 90 } }], 3_000_000);
    expect((await readings(keyed, ROW.slug)).map((x) => x.gmp)).toEqual([80, 90]);
  });

  describe("day-wise build-up by category", () => {
    const IST = (s: string) => Date.parse(`${s}+05:30`);
    const times = (total: number, qib: number) => ({ total, qib, nii: 2, snii: null, bnii: null, retail: 3 });
    const wipe = async () => { await clean(); await db.prepare("DELETE FROM ipo_category_readings").run(); };
    const count = async () => (await db.prepare("SELECT COUNT(*) AS n FROM ipo_category_readings").first<{ n: number }>())!.n;

    it("keeps a reading only when a category changes, and passes over a lower total as a stale copy", async () => {
      const { recordCategories } = await import("../src/lib/ipoguru.js");
      await wipe();
      expect(await recordCategories(keyed, "a", "nse", times(10, 1), 1_000_000)).toBe(true);
      expect(await recordCategories(keyed, "a", "nse", times(10, 1), 2_000_000)).toBe(false);
      expect(await recordCategories(keyed, "a", "nse", times(10, 5), 3_000_000)).toBe(true);
      expect(await recordCategories(keyed, "a", "nse", times(2, 9), 4_000_000)).toBe(false);
      expect(await recordCategories(keyed, "a", "nse", { total: null, qib: null, nii: null, snii: null, bnii: null, retail: null }, 5_000_000)).toBe(false);
      expect(await count()).toBe(2);
    });

    it("gives each bidding day its last reading in India time, numbered across a weekend", async () => {
      const { categoryDays, recordCategories } = await import("../src/lib/ipoguru.js");
      await wipe();
      await recordCategories(keyed, "a", "nse", times(1, 1), IST("2026-10-30T11:00:00"));
      await recordCategories(keyed, "a", "nse", times(2, 1), IST("2026-10-30T23:50:00")); // still the 30th in India, the next day nowhere else matters
      await recordCategories(keyed, "a", "nse", times(5, 2), IST("2026-11-02T17:00:00"));
      await recordCategories(keyed, "a", "nse", times(9, 3), IST("2026-11-04T10:00:00")); // after the close
      const days = await categoryDays(keyed, "a", "2026-10-30", "2026-11-03");
      expect(days.map((d) => [d.day, d.date, d.total, d.time])).toEqual([[1, "2026-10-30", 2, "23:50"], [2, "2026-11-02", 5, "17:00"]]);
    });

    it("reads the provider's category tree, with sNII and bNII nested under NII", async () => {
      const { parseLiveCategories } = await import("../src/lib/ipoguru.js");
      const body = { categories: [{ key: "QIB", times: "139.69", times_value: 139.69 }, { key: "NII", times_value: 87.24, sub_categories: [{ key: "BNII_CORP", times_value: 1 }, { key: "BNII", times_value: 90 }, { key: "SNII_IND", times_value: 2 }, { key: "SNII", times: "80.5", times_value: null }] }, { key: "Retail", times_value: 25.4 }, { key: "Total", times_value: 71.25 }] };
      expect(parseLiveCategories(body)).toEqual({ total: 71.25, qib: 139.69, nii: 87.24, snii: 80.5, bnii: 90, retail: 25.4 });
      expect(parseLiveCategories({ categories: [] })).toBeNull();
      expect(parseLiveCategories(null)).toBeNull();
    });

    const stub = (plan: string, spent: string[]) => vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/subscription")) { spent.push(url); return ok({ categories: [{ key: "QIB", times_value: 4 }, { key: "Total", times_value: 7 }] }, plan); }
      if (url.includes("ipoguru.in")) return ok([ROW, { ...ROW, slug: "vectras-enprocon-sme-ipo", name: "Vectras Enprocon", display_name: "Vectras Enprocon", subscription_total: "1.29" }], plan);
      if (url.includes("ipo-current-issue")) return new Response(JSON.stringify([{ companyName: "Maxwell Engineering Solutions Limited", issueEndDate: "03-Nov-2026", issuePrice: "Rs.150 to Rs.158", issueStartDate: "30-Oct-2026", series: "SME", status: "Active", symbol: "MAXWELL" }]));
      if (url.includes("symbol=MAXWELL")) return new Response(JSON.stringify({ activeCat: { dataList: [{ category: "Qualified Institutional Buyers(QIBs)", srNo: "1", noOfShareOffered: "0", noOfSharesBid: "177255200", noOfTotalMeant: "0.00" }, { category: "Retail", srNo: "3", noOfTotalMeant: "110.21" }, { category: "Total", srNo: null, noOfTotalMeant: "80.34" }] }, issueInfo: { dataList: [] } }));
      return new Response("nope", { status: 403 });
    }));

    it("takes NSE's figure, and asks the provider only for what NSE lacks: an issue or its unpublished QIB", async () => {
      const { recordIpoCategories } = await import("../src/jobs/ipo-readings.js");
      await wipe();
      const spent: string[] = [];
      stub("standard", spent);
      await db.prepare("INSERT INTO external_cache (key, body, fetched_at) VALUES ('ipoguru:quota', ?, 0)").bind(JSON.stringify({ plan: "standard", remaining: 900, limit: 1000, retry_at: 0, day: "2026-11-03" })).run();
      expect(await recordIpoCategories(keyed, IST("2026-11-03T12:00:00"))).toEqual({ issues: 2, saved: 2 });
      const rows = await db.prepare("SELECT slug, source, total, qib, retail FROM ipo_category_readings ORDER BY slug").all<any>();
      expect(rows.results).toEqual([
        { slug: ROW.slug, source: "nse", total: 80.34, qib: 4, retail: 110.21 },
        { slug: "vectras-enprocon-sme-ipo", source: "ipoguru", total: 7, qib: 4, retail: null },
      ]);
      expect(spent).toHaveLength(2);
    });

    it("leaves QIB unknown rather than zero when NSE writes 0.00 against real bids and the plan can't fill it", async () => {
      const { recordIpoCategories } = await import("../src/jobs/ipo-readings.js");
      await wipe();
      stub("free", []);
      await recordIpoCategories(keyed, IST("2026-11-03T12:00:00"));
      expect(await db.prepare("SELECT qib, retail FROM ipo_category_readings WHERE source = 'nse'").first()).toEqual({ qib: null, retail: 110.21 });
    });

    // Vedant Poly Fabs on 4 Nov: every category row reads 0 offered and 0.00 times, while the current-issue list has the real total.
    const zeroTable = (plan: string, spent: string[]) => vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/subscription")) { spent.push(url); return ok({ categories: [{ key: "QIB", times_value: 1 }, { key: "NII", times_value: 0.9, sub_categories: [{ key: "BNII", times_value: 0.8 }] }, { key: "Retail", times_value: 0.8 }, { key: "Total", times_value: 0.5 }] }, plan); }
      if (url.includes("ipoguru.in")) return ok([{ ...ROW, subscription_total: "0.5" }], plan);
      if (url.includes("ipo-current-issue")) return new Response(JSON.stringify([{ companyName: "Maxwell Engineering Solutions Limited", issueEndDate: "03-Nov-2026", issuePrice: "Rs.150 to Rs.158", issueStartDate: "30-Oct-2026", series: "SME", status: "Active", symbol: "MAXWELL", noOfTime: "0.87" }]));
      if (url.includes("symbol=MAXWELL")) return new Response(JSON.stringify({ activeCat: { dataList: [{ category: "Qualified Institutional Buyers(QIBs)", srNo: "1", noOfShareOffered: "0", noOfSharesBid: "68400", noOfTotalMeant: "0.00" }, { category: "Non Institutional Investors", srNo: "2", noOfShareOffered: "0", noOfSharesBid: "2432400", noOfTotalMeant: "0.00" }, { category: "Total", srNo: null, noOfShareOffered: "0.0", noOfSharesBid: "2500800.0", noOfTotalMeant: "0.00" }] }, issueInfo: { dataList: [] } }));
      return new Response("nope", { status: 403 });
    }));
    const saved = () => db.prepare("SELECT source, total, qib, nii, bnii, retail FROM ipo_category_readings").first();

    it("takes NSE's total from its current-issue list when the category table says 0.00, and records it on a free key", async () => {
      const { recordIpoCategories } = await import("../src/jobs/ipo-readings.js");
      await wipe();
      const spent: string[] = [];
      zeroTable("free", spent);
      expect((await recordIpoCategories(keyed, IST("2026-11-03T12:00:00"))).saved).toBe(1);
      expect(await saved()).toEqual({ source: "nse", total: 0.87, qib: null, nii: null, bnii: null, retail: null });
      expect(spent).toHaveLength(0);
    });

    it("fills the categories NSE left unknown from the provider on Standard, keeping NSE's total", async () => {
      const { recordIpoCategories } = await import("../src/jobs/ipo-readings.js");
      await wipe();
      zeroTable("standard", []);
      await db.prepare("INSERT INTO external_cache (key, body, fetched_at) VALUES ('ipoguru:quota', ?, 0)").bind(JSON.stringify({ plan: "standard", remaining: 900, limit: 1000, retry_at: 0, day: "2026-11-03" })).run();
      expect((await recordIpoCategories(keyed, IST("2026-11-03T12:00:00"))).saved).toBe(1);
      expect(await saved()).toEqual({ source: "nse", total: 0.87, qib: 1, nii: 0.9, bnii: 0.8, retail: 0.8 });
    });

    it("spends nothing outside bidding hours or at weekends, and doesn't ask a free key for categories", async () => {
      const { recordIpoCategories } = await import("../src/jobs/ipo-readings.js");
      await wipe();
      const spent: string[] = [];
      stub("free", spent);
      expect(await recordIpoCategories(keyed, IST("2026-11-03T20:00:00"))).toEqual({ issues: 0, saved: 0 });
      expect(await recordIpoCategories(keyed, IST("2026-11-01T12:00:00"))).toEqual({ issues: 0, saved: 0 });
      expect(fetch).not.toHaveBeenCalled();
      expect((await recordIpoCategories(keyed, IST("2026-11-03T12:00:00"))).saved).toBe(1);
      expect(spent).toHaveLength(0);
    });
  });

  it("merges the exchange's fresher subscription into the dashboard and keeps BSE-only issues", async () => {
    await clean();
    const BSE = { ...ROW, slug: "vectras-enprocon-sme-ipo", name: "Vectras Enprocon", display_name: "Vectras Enprocon", sub_type: "BSE SME", subscription_total: "1.29", gmp: { price: "0", percentage: "0" } };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("ipoguru.in")) return ok([ROW, BSE]);
      if (url.includes("ipo-current-issue")) return new Response(JSON.stringify([{ companyName: "Maxwell Engineering Solutions Limited", issueEndDate: "03-Nov-2026", issuePrice: "Rs.150 to Rs.158", issueStartDate: "30-Oct-2026", series: "SME", status: "Active", symbol: "MAXWELL" }]));
      if (url.includes("all-upcoming-issues")) return new Response("[]");
      if (url.includes("symbol=MAXWELL")) return new Response(JSON.stringify({ activeCat: { updateTime: "Updated as on 02-Nov-2026 17:56:00", dataList: [{ category: "Retail", srNo: "3", noOfShareOffered: "1200000", noOfSharesBid: "132251200", noOfTotalMeant: "110.21" }, { category: "Total", srNo: null, noOfShareOffered: "2401600", noOfSharesBid: "192949600", noOfTotalMeant: "80.34" }] }, issueInfo: { dataList: [] } }));
      if (url.includes("holiday-master")) return new Response(JSON.stringify({ CM: [] }));
      return new Response("nope", { status: 403 });
    }));
    const res = await app.fetch(new Request("https://x/v1/market/ipo-dashboard", { headers: { "x-internal-key": "i" } }), keyed);
    const d = ((await res.json()) as any).data;
    const [maxwell, vectras] = d.rows;
    expect(maxwell).toMatchObject({ symbol: "MAXWELL", times_total: 80.34, retail: 110.21, sub_from: "nse", gmp: 80, profit_per_lot: 64000, sub_as_of: "2026-11-02T17:56:00+05:30" });
    expect(vectras).toMatchObject({ symbol: null, times_total: 1.29, sub_from: "ipoguru", gmp: 0, est_listing: 158 });
    expect(d.sources.ipoguru).toMatchObject({ connected: true, plan: "free" });
  });

  it("opens a BSE-only issue by slug on a free key, and names what the plan withholds", async () => {
    await clean();
    const BSE = { ...ROW, slug: "vectras-enprocon-sme-ipo", name: "Vectras Enprocon", display_name: "Vectras Enprocon", sub_type: "BSE SME", subscription_total: "1.29", price_min: 99, price_max: 105, lot_size: 1200 };
    const DOC = { ...BSE, images: { logo: "https://x/l.webp" }, timeline: { open_date: "2026-10-30", close_date: "2026-11-03", allotment_date: "2026-11-04", refund_date: "2026-11-05", credit_to_demat_date: "2026-11-05", listing_date: "2026-11-06" }, issue: { issue_size: "53.05", price_min: 99, price_max: 105, lot_size: 1200, face_value: "10", sale_type: "Fresh capital", listing_on: "BSE SME", nse_symbol: null }, subscription_summary: { total: "1.29", qib: "1.4", nii: "1.1", retail: "1.3", applications: "278", updated_at: "2026-11-02T14:00:15.000000Z" }, locked: { fields: ["company", "documents"] } };
    const get = vi.fn(async (url: string) => {
      if (url.endsWith("/ipos?months=3")) return ok([BSE]);
      if (url.endsWith("/vectras-enprocon-sme-ipo")) return ok(DOC);
      if (url.includes("ipoguru.in")) throw new Error(`free plan must not ask for ${url}`);
      if (url.includes("ipo-current-issue") || url.includes("all-upcoming")) return new Response("[]");
      if (url.includes("holiday-master")) return new Response(JSON.stringify({ CM: [] }));
      return new Response("nope", { status: 403 });
    });
    vi.stubGlobal("fetch", get);
    await db.prepare("INSERT INTO external_cache (key, body, fetched_at) VALUES ('ipoguru:/ipos?months=3', ?, ?)").bind(JSON.stringify([BSE]), Math.floor(Date.now() / 1000)).run();
    const res = await app.fetch(new Request("https://x/v1/market/ipo-detail?symbol=vectras-enprocon-sme-ipo", { headers: { "x-internal-key": "i" } }), keyed);
    expect(res.status).toBe(200);
    const d = ((await res.json()) as any).data;
    expect(d).toMatchObject({ name: "Vectras Enprocon", board: "SME", price_high: 105, issue_size_cr: 53.05, sub_from: "ipoguru", applications: 278, locked: ["company", "documents"], company: null });
    expect(d.subscription.map((r: any) => r.key)).toEqual(["qib", "nii", "retail", "total"]);
    expect(d.costs.lot_cost).toBe(126000);
    expect(d.gmp.latest).toBe(80);
  });
});
