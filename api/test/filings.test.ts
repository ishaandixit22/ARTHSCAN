import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { migrate, SqliteDatabase } from "../src/db/sqlite.js";
import type { Env } from "../src/env.js";
import { actionType, filingKind } from "../src/handlers/filings.js";

const db = new SqliteDatabase(":memory:");
const env: Env = { DB: db, PUBLIC_SITE_ORIGIN: "https://arthscan.me", TOKEN_PEPPER: "p", INTERNAL_API_KEY: "i", FREE_DAILY_QUOTA: "50" };
const get = async (path: string) => {
  const res = await app.fetch(new Request(`https://x${path}`, { headers: { "x-internal-key": "i" } }), env);
  return { status: res.status, body: (await res.json()) as any };
};

beforeAll(() => migrate(db));
afterEach(() => vi.unstubAllGlobals());

const ANNOUNCEMENTS = [
  { an_dt: "29-Oct-2026 19:25:24", symbol: "TMB", sm_name: "Tamilnad Mercantile Bank Limited", desc: "Analysts/Institutional Investor Meet/Con. Call Updates",
    attchmntText: "Tamilnad Mercantile Bank Limited has informed the Exchange about Transcript", attchmntFile: "https://nsearchives.nseindia.com/corporate/x.pdf", attFileSize: "370.84 KB" },
  { an_dt: "29-Oct-2026 19:33:38", symbol: "ICRA", sm_name: "ICRA Limited", desc: "Investor Presentation",
    attchmntText: "ICRA Limited has informed the Exchange about Investor Presentation", attchmntFile: "https://nsearchives.nseindia.com/corporate/y.pdf" },
  { an_dt: "29-Oct-2026 18:00:00", symbol: "ACC", sm_name: "ACC Limited", desc: "Outcome of Board Meeting",
    attchmntText: "ACC Limited has informed the Exchange regarding Unaudited Financial Results for the quarter ended September 30, 2026", attchmntFile: "-" },
];

describe("filing kinds", () => {
  it("sorts announcements into what people look for", () => {
    expect(filingKind("Analysts/Institutional Investor Meet/Con. Call Updates", "X has informed the Exchange about Transcript")).toBe("transcript");
    expect(filingKind("Analysts/Institutional Investor Meet/Con. Call Updates", "Schedule of meet")).toBe("concall");
    expect(filingKind("Outcome of Board Meeting", "Unaudited Financial Results for the quarter")).toBe("results");
    expect(filingKind("Outcome of Board Meeting", "Appointment of director")).toBe("board");
    expect(filingKind("Press Release", "X")).toBe("press");
    expect(actionType("Interim Dividend - Rs 17 Per Share")).toBe("Dividend");
    expect(actionType("Face Value Split (Sub-Division) - From Rs 10/- Per Share To Re 1/- Per Share")).toBe("Split");
  });
});

describe("NSE filings tools", () => {
  it("maps filings with their PDFs, filters by kind and caches the answer", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(ANNOUNCEMENTS), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await get("/v1/market/filings");
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(d.filings[0]).toMatchObject({ symbol: "TMB", kind: "transcript", subject: "Transcript", pdf: "https://nsearchives.nseindia.com/corporate/x.pdf", time: "2026-10-29 19:25" });
    expect(d.filings[2]).toMatchObject({ kind: "results", pdf: null });
    expect(d.counts).toMatchObject({ transcript: 1, presentation: 1, results: 1 });
    const t = await get("/v1/market/filings?kind=transcript");
    expect(t.body.data.filings.map((f: any) => f.symbol)).toEqual(["TMB"]);
    expect(fetchMock).toHaveBeenCalledTimes(1); // second call served from the cache
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(/corporate-announcements\?index=equities&from_date=\d{2}-\d{2}-\d{4}&to_date=/);
  });

  it("asks NSE for one company's longer history when a symbol is given", async () => {
    const fetchMock = vi.fn(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await get("/v1/market/filings?symbol=tcs");
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(/&symbol=TCS$/);
  });

  it("builds the results calendar and corporate actions", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(url.includes("event-calendar")
      ? JSON.stringify([
          { symbol: "B", company: "B Ltd", purpose: "Dividend", bm_desc: "x", date: "31-Oct-2026" },
          { symbol: "A", company: "A Ltd", purpose: "Financial Results", bm_desc: "To approve results", date: "30-Oct-2026" },
        ])
      : JSON.stringify([{ symbol: "CRISIL", comp: "Crisil Limited", subject: "Interim Dividend - Rs 17 Per Share", exDate: "29-Oct-2026", recDate: "29-Oct-2026", faceVal: "1", series: "EQ" }]))));
    const ev = (await get("/v1/market/events?results_only=true")).body.data;
    expect(ev.events).toEqual([expect.objectContaining({ symbol: "A", date: "2026-10-30", results: true })]);
    const ca = (await get("/v1/market/corporate-actions")).body.data;
    expect(ca.actions[0]).toMatchObject({ symbol: "CRISIL", type: "Dividend", ex_date: "2026-10-29", record_date: "2026-10-29" });
  });

  it("reads NSE's bulk and block deal files and turns a blocked request into an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(url.includes("bulk")
      ? "Date,Symbol,Security Name,Client Name,Buy/Sell,Quantity Traded,Trade Price / Wght. Avg. Price,Remarks\n29-OCT-2026,AEROFLEX,Aeroflex Industries Ltd,\"ALPHAGREP SECURITIES PRIVATE LIMITED\",BUY,\"1,315,179\",553.64,-\n"
      : "Date,Symbol,Security Name,Client Name,Buy/Sell,Quantity Traded,Trade Price / Wght. Avg. Price\nNO RECORDS,,,,,,\n")));
    const d = (await get("/v1/market/deals")).body.data;
    expect(d.bulk).toEqual([{ date: "2026-10-29", symbol: "AEROFLEX", company: "Aeroflex Industries Ltd", client: "ALPHAGREP SECURITIES PRIVATE LIMITED", side: "Buy", quantity: 1315179, price: 553.64 }]);
    expect(d.block).toEqual([]);

    db.raw.exec("DELETE FROM external_cache");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Access Denied</html>", { status: 403 })));
    expect((await get("/v1/market/events")).status).toBe(502);
  });
});

describe("results documents and the events calendar", () => {
  it("groups each company's results PDF, presentation and transcript together", async () => {
    db.raw.exec("DELETE FROM external_cache");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
      ...ANNOUNCEMENTS,
      { an_dt: "29-Oct-2026 20:00:00", symbol: "ACC", sm_name: "ACC Limited", desc: "Press Release", attchmntText: "ACC Limited has informed the Exchange about Press Release", attchmntFile: "https://nsearchives.nseindia.com/corporate/p.pdf" },
    ]), { status: 200 })));
    const d = (await get("/v1/market/company-documents")).body.data;
    const acc = d.companies.find((c: any) => c.symbol === "ACC");
    expect(d.companies[0].symbol).toBe("ACC"); // newest filing first
    expect(acc.docs.results).toHaveLength(1);
    expect(acc.docs.press[0].pdf).toBe("https://nsearchives.nseindia.com/corporate/p.pdf");
    expect(d.companies.find((c: any) => c.symbol === "TMB").docs.transcript).toHaveLength(1);
  });

  it("merges economic dates, NSE expiries, holidays and big-company results", async () => {
    db.raw.exec(`DELETE FROM external_cache;
      INSERT OR IGNORE INTO stocks (symbol, name) VALUES ('TCS', 'Tata Consultancy Services');
      INSERT OR REPLACE INTO stock_metrics (symbol, as_of, close, turnover) VALUES ('TCS', '2026-10-28', 2460, 6e9);`);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-29T10:00:00Z"));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("contract-info")) return new Response(JSON.stringify({ expiryDates: ["03-Nov-2026", "09-Nov-2026", "17-Nov-2026", "23-Nov-2026", "01-Dec-2026", "29-Dec-2026"] }));
      if (url.includes("holiday-master")) return new Response(JSON.stringify({ CM: [{ tradingDate: "08-Nov-2026", description: "Diwali Laxmi Pujan*" }, { tradingDate: "24-Nov-2026", description: "Prakash Gurpurb Sri Guru Nanak Dev" }] }));
      if (url.includes("event-calendar")) return new Response(JSON.stringify([{ symbol: "TCS", company: "TCS Ltd", purpose: "Financial Results", bm_desc: "", date: "12-Nov-2026" }, { symbol: "TINY", company: "Tiny Ltd", purpose: "Financial Results", bm_desc: "", date: "12-Nov-2026" }]));
      return new Response("{}", { status: 500 });
    }));
    const d = (await get("/v1/market/events-calendar?days=45")).body.data;
    vi.useRealTimers();
    const titles = d.events.map((e: any) => `${e.date} ${e.title}`);
    expect(titles).toContain("2026-11-12 India CPI inflation");
    expect(titles).toContain("2026-11-23 Monthly F&O expiry");
    expect(titles).toContain("2026-11-17 Nifty weekly expiry");
    expect(titles).toContain("2026-11-08 Diwali Laxmi Pujan: market holiday, special session");
    expect(titles).toContain("2026-11-12 TCS results");
    expect(titles.some((t: string) => t.includes("TINY"))).toBe(false); // only the most traded companies
    expect(titles).toContain("2026-12-04 RBI monetary policy decision"); // within 45 days
    expect(d.events.every((e: any) => e.date >= "2026-10-29")).toBe(true);
  });
});

describe("stored NSE answers", () => {
  const cacheKey = "nse:www.nseindia.com/api/event-calendar";
  const stale = JSON.stringify([{ date: "2026-11-02", symbol: "OLD", company: "Old Ltd", purpose: "Financial Results", results: true, details: "" }]);
  const aged = (hours: number) => Math.floor(Date.now() / 1000) - hours * 3600;

  it("serves an expired copy at once and refreshes it afterwards", async () => {
    db.raw.exec("DELETE FROM external_cache");
    db.raw.prepare("INSERT INTO external_cache (key, body, fetched_at) VALUES (?, ?, ?)").run(cacheKey, stale, aged(5));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([{ symbol: "NEW", company: "New Ltd", purpose: "Financial Results", bm_desc: "", date: "03-Nov-2026" }])));
    vi.stubGlobal("fetch", fetchMock);
    const first = (await get("/v1/market/events")).body.data;
    expect(first.events[0].symbol).toBe("OLD"); // answered from the stored copy
    await new Promise((r) => setTimeout(r, 20)); // the background refresh runs
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await get("/v1/market/events")).body.data.events[0].symbol).toBe("NEW");
  });

  it("keeps serving the stored copy when NSE fails", async () => {
    db.raw.exec("DELETE FROM external_cache");
    db.raw.prepare("INSERT INTO external_cache (key, body, fetched_at) VALUES (?, ?, ?)").run(cacheKey, stale, aged(30));
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>blocked</html>", { status: 403 })));
    const r = await get("/v1/market/events");
    expect(r.status).toBe(200);
    expect(r.body.data.events[0].symbol).toBe("OLD");
  });
});
