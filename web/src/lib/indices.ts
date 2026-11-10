// The indices that get a page of their own at /indices/<slug>: the six on the front page's strip.
// `name` is the index's name in index_daily (NSE's daily index report) and in Dhan's live list;
// `heatmap` is its key for /v1/market/heatmap, which lists its constituents.
// `etfs` are NSE-listed ETFs that track it, most traded first (a hand-kept list).

export type IndexEtf = { symbol: string; name: string };
export type IndexInfo = { slug: string; name: string; label: string; short: string; heatmap: string | null; about: string; etfs: IndexEtf[] };

export const INDICES: IndexInfo[] = [
  {
    slug: "nifty-50", short: "Nifty 50", name: "Nifty 50", label: "Nifty 50", heatmap: "nifty50",
    about: "The 50 largest and most traded companies on NSE, weighted by free-float market value. India's benchmark for the large-cap market.",
    etfs: [
      { symbol: "NIFTYBEES", name: "Nippon India ETF Nifty 50 BeES" },
      { symbol: "NIFTYIETF", name: "ICICI Prudential Nifty 50 ETF" },
      { symbol: "SETFNIF50", name: "SBI Nifty 50 ETF" },
      { symbol: "NIFTY1", name: "Kotak Nifty 50 ETF" },
      { symbol: "NIFTYETF", name: "Mirae Asset Nifty 50 ETF" },
      { symbol: "HDFCNIFTY", name: "HDFC Nifty 50 ETF" },
      { symbol: "BSLNIFTY", name: "Aditya Birla Sun Life Nifty 50 ETF" },
      { symbol: "NIFTYAXIS", name: "Axis Nifty 50 ETF" },
      { symbol: "QNIFTY", name: "Quantum Nifty 50 ETF" },
    ],
  },
  {
    slug: "nifty-bank", short: "Bank Nifty", name: "Nifty Bank", label: "Nifty Bank", heatmap: "niftybank",
    about: "The most liquid and largest Indian banking stocks on NSE. The index behind most of India's bank derivatives.",
    etfs: [
      { symbol: "BANKBEES", name: "Nippon India ETF Nifty Bank BeES" },
      { symbol: "SETFNIFBK", name: "SBI Nifty Bank ETF" },
      { symbol: "BANKNIFTY1", name: "Kotak Nifty Bank ETF" },
      { symbol: "BANKIETF", name: "ICICI Prudential Nifty Bank ETF" },
      { symbol: "BANKETF", name: "Mirae Asset Nifty Bank ETF" },
      { symbol: "HDFCNIFBAN", name: "HDFC Nifty Bank ETF" },
    ],
  },
  {
    slug: "nifty-midcap-100", short: "Midcap 100", name: "NIFTY Midcap 100", label: "Nifty Midcap 100", heatmap: "midcap100",
    about: "100 mid-sized companies, the ones ranked just below the Nifty 100 by market value. A gauge of the mid-cap market.",
    etfs: [{ symbol: "LICNMID100", name: "LIC MF Nifty Midcap 100 ETF" }],
  },
  {
    slug: "nifty-smallcap-100", short: "Smallcap 100", name: "NIFTY Smallcap 100", label: "Nifty Smallcap 100", heatmap: "smallcap100",
    about: "100 of the most traded small companies, ranked below the Midcap 150. Moves further than the large-cap indices, both ways.",
    etfs: [],
  },
  {
    slug: "nifty-it", short: "Nifty IT", name: "Nifty IT", label: "Nifty IT", heatmap: "niftyit",
    about: "India's listed IT services and software companies. Driven largely by overseas tech spending and the rupee.",
    etfs: [
      { symbol: "ITBEES", name: "Nippon India ETF Nifty IT" },
      { symbol: "IT", name: "Kotak Nifty IT ETF" },
      { symbol: "ITIETF", name: "ICICI Prudential Nifty IT ETF" },
      { symbol: "HDFCNIFIT", name: "HDFC Nifty IT ETF" },
      { symbol: "ITETF", name: "Mirae Asset Nifty IT ETF" },
      { symbol: "SBIETFIT", name: "SBI Nifty IT ETF" },
    ],
  },
  {
    slug: "india-vix", short: "India VIX", name: "India VIX", label: "India VIX", heatmap: null,
    about: "The market's expected volatility over the next 30 days, worked out from Nifty 50 option prices. It rises when traders pay up for protection, so it usually moves against the Nifty.",
    etfs: [],
  },
];

export const indexBySlug = (slug: string) => INDICES.find((i) => i.slug === slug) ?? null;
export const indexByName = (name: string) => INDICES.find((i) => i.name === name) ?? null;
export const indexHref = (name: string) => {
  const i = indexByName(name);
  return i ? `/indices/${i.slug}` : "/valuations";
};
/** The front page strip's shorter label, so all six fit on one line. */
export const indexShort = (name: string) => indexByName(name)?.short ?? name;
