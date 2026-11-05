// Site navigation. Most market tools live behind one "Markets" menu, grouped as
// Market, Flows and Companies, so the top bar carries a few links instead of
// fourteen. The Screener is a link of its own.

import { CATEGORIES, META } from "$lib/calculators/catalog";

/** A dropdown under a top-bar link: columns of links, each with an optional one-line note. */
export type NavMenu = {
  /** Sentence shown above the columns, linking to the section's front page. */
  overview: { href: string; label: string };
  groups: { title: string; items: { href: string; label: string; about?: string }[] }[];
  /** Spans the full width of the bar, for menus with many entries. */
  wide?: boolean;
};
export type NavItem = { href: string; label: string; about: string; icon: string; match?: string[]; menu?: NavMenu };

// 24×24 outline icons (1.6px stroke), one per destination, drawn for what each tool shows.
export const ICON = {
  home: "M4 11.5 12 4l8 7.5M6 10v10h4.5v-6h3v6H18V10",
  menu: "M4 7h16M4 12h16M4 17h16",
  search: "M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.3 15.3 20 20",
  close: "M6 6l12 12M18 6 6 18",
  chevron: "m6 9 6 6 6-6",
  account: "M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4.5 20.5c1-4 4-5.5 7.5-5.5s6.5 1.5 7.5 5.5",
  breadth: "M4 18 9 9l4 5 7-10M4 21h16",
  about: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5.5M12 7.8h.01",
  pricing: "M7 4h10M7 8.5h10M9 4c4.5 0 6 2 6 4.5S13.5 13 9 13h-2l8 7.5",
  contact: "M3.5 6h17v12h-17zM3.5 6.5 12 13l8.5-6.5",
  legal: "M6 3.5h12v17H6zM9 8h6M9 12h6M9 16h3",
  map: "M4 6.5 9.5 4l5 2.5L20 4v13.5L14.5 20l-5-2.5L4 20zM9.5 4v13.5M14.5 6.5V20",
  token: "M8 11a4 4 0 1 1 3.4-1.9L20 17.5V20h-3v-2h-2v-2h-2l-1.6-1.6",
  mcp: "M9 3v5M15 3v5M6.5 8h11v3.5a5.5 5.5 0 0 1-11 0zM12 17v4",
  docs: "M5 4.5h6a2 2 0 0 1 2 2V20a2 2 0 0 0-2-2H5zM19 4.5h-4a2 2 0 0 0-2 2V20a2 2 0 0 1 2-2h4z",
  overview: "M4 20h16M7 16v-4M12 16V7M17 16v-6",                                   // bars over a baseline
  live: "M12 10.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zM8 8a5.7 5.7 0 0 0 0 8M16 8a5.7 5.7 0 0 1 0 8M5.2 5.2a9.6 9.6 0 0 0 0 13.6M18.8 5.2a9.6 9.6 0 0 1 0 13.6", // broadcast
  heatmap: "M3.5 3.5h9v9h-9zM14.5 3.5h6v5h-6zM14.5 10.5h6v10h-6zM3.5 14.5h9v6h-9z", // tiles of different sizes
  signals: "M13 2.8 5 13.5h6l-1 7.7 8-10.7h-6z",                                    // a spark
  screener: "M3.5 5h17l-6.5 7.8v5.7l-4 2v-7.7z",                                    // funnel
  stocks: "M9 6h11M9 12h11M9 18h11M4.5 6h.5M4.5 12h.5M4.5 18h.5",                   // the A-Z list
  sectors: "M11 3.1A9 9 0 1 0 20.9 13H11zM14 2.6A8 8 0 0 1 21.4 10H14z",           // pie with a slice out
  valuations: "M12 3.5v17M8 20.5h8M4 7.5h16M4 7.5 1.5 13a2.6 2.6 0 0 0 5 0zM20 7.5 17.5 13a2.6 2.6 0 0 0 5 0z", // balance scale
  deliveries: "M3.5 7.5 12 3.2l8.5 4.3v9L12 20.8l-8.5-4.3zM3.5 7.5 12 11.8l8.5-4.3M12 11.8v9", // parcel
  flows: "M4 8h14l-3.5-3.5M20 16H6l3.5 3.5",                                        // money in, money out
  news: "M5 4.5h11.5v15H6.5A1.5 1.5 0 0 1 5 18zM16.5 8.5H19V18a1.5 1.5 0 0 1-3 0M8 8.5h5.5M8 12h5.5M8 15.5h3.5",
  ipos: "M12 3c3 2.2 4.5 5.5 4 9.5l-2 3h-4l-2-3C7.5 8.5 9 5.2 12 3zM10 15.5 8 20l4-1.8 4 1.8-2-4.5M12 9.5h.01", // rocket
  funds: "M12 4c3.9 0 7 1.3 7 3s-3.1 3-7 3-7-1.3-7-3 3.1-3 7-3zM5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5", // a stack of coins
  api: "M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15",
  ban: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5.7 5.7l12.6 12.6",                   // no-entry circle
  commodities: "M6.5 4h11l3 5-8.5 11L3.5 9zM3.5 9h17M9.5 4 8 9l4 11 4-11-1.5-5",       // a cut gem
  deals: "M3 12.5 7.5 8l3 2.5 3.5-3.5M14 7h3.5v3.5M21 11.5 16.5 16l-3-2.5L10 17M10 17H6.5v-3.5", // two-way trade
  earnings: "M6 3.5h8.5L19 8v12.5H6zM14 3.5V8h5M9.5 17v-3M12.5 17v-5.5M15.5 17v-2",   // a report with bars
  actions: "M4 6.5h16v13.5H4zM4 10.5h16M8.5 4v4M15.5 4v4M15 16.2a1.6 1.6 0 1 0 0-.1z", // calendar with a mark
  meetings: "M4 6.5h16v13.5H4zM4 10.5h16M8.5 4v4M15.5 4v4M8 14h1M11.5 14h1M15 14h1M8 17h1M11.5 17h1", // calendar grid
  filings: "M6 3.5h8.5L19 8v12.5H6zM14 3.5V8h5M9 12h7M9 15h7M9 18h4",               // document with lines
  events: "M4 6.5h16v13.5H4zM4 10.5h16M8.5 4v4M15.5 4v4M12 13v3.2l2 1.3",            // calendar with a clock hand                          // code brackets
  calculators: "M5.5 3h13v18h-13zM8.5 6h7v3.5h-7zM8.5 13h.5M12 13h.5M15.5 13h.5M8.5 17h.5M12 17h.5M15.5 17h.5", // a pocket calculator
};

export type NavGroup = { title: string; items: NavItem[] };

const OVERVIEW: NavItem = { href: "/", label: "Overview", about: "Breadth, movers and sectors today", icon: ICON.overview };
const LIVE: NavItem = { href: "/live", label: "Live", about: "Prices as they trade", icon: ICON.live };

/** The Markets menu, in three labelled groups. Live joins for accounts with live prices. */
export function navGroups(live: boolean): NavGroup[] {
  return [
    {
      title: "Market",
      items: [
        OVERVIEW,
        ...(live ? [LIVE] : []),
        { href: "/events", label: "Events calendar", about: "RBI, Fed, inflation, GDP, expiries, holidays, big results", icon: ICON.events },
        { href: "/heatmap", label: "Heatmap", about: "The 250 most traded stocks by sector", icon: ICON.heatmap },
        { href: "/valuations", label: "Market valuation", about: "Index P/E, P/B and yield history", icon: ICON.valuations },
        { href: "/sectors", label: "Sector rotation", about: "Returns and leadership by sector", icon: ICON.sectors },
        { href: "/signals", label: "Signals", about: "Breakouts, crosses, RSI and volume spikes", icon: ICON.signals },
        { href: "/deliveries", label: "Top deliveries", about: "Where buyers took delivery", icon: ICON.deliveries },
        { href: "/fo-ban", label: "F&O ban", about: "Stocks in the ban today and those near the limit", icon: ICON.ban },
        { href: "/commodities", label: "Commodities", about: "MCX futures: gold, silver, crude, gas, metals", icon: ICON.commodities },
      ],
    },
    {
      title: "Flows",
      items: [
        { href: "/fii-dii", label: "FII / DII data", about: "Foreign and domestic flows, by sector", icon: ICON.flows },
        { href: "/deals", label: "Bulk / block deals", about: "Large trades and who made them", icon: ICON.deals },
      ],
    },
    {
      title: "Companies",
      items: [
        { href: "/earnings", label: "Earnings tracker", about: "Results calendar, results filed and call transcripts", icon: ICON.earnings },
        { href: "/corporate-actions", label: "Corporate actions", about: "Dividends, bonuses, splits and record dates", icon: ICON.actions },
        { href: "/board-meetings", label: "Board meetings", about: "Upcoming board meetings and their purpose", icon: ICON.meetings },
        { href: "/filings", label: "Company filings", about: "Every NSE filing with its PDF", icon: ICON.filings },
        { href: "/stocks", label: "All stocks", about: "Every NSE stock, A to Z", icon: ICON.stocks, match: ["/stock/"] },
      ],
    },
  ];
}

const SCREENER_MENU: NavMenu = {
  overview: { href: "/screener", label: "All screeners" },
  groups: [
    {
      title: "Prebuilt screens",
      items: [
        { href: "/screener", label: "Fundamental screens", about: "Growth, quality, value and dividends, from company statements. Refreshed weekly." },
        { href: "/screener?tab=technical", label: "Technical screens", about: "Breakouts, crosses, RSI and volume spikes, on live prices." },
      ],
    },
    { title: "Your own", items: [{ href: "/screener/custom", label: "Build your own", about: "Set your own filters on price, returns and fundamentals." }] },
  ],
};

const IPO_MENU: NavMenu = {
  overview: { href: "/ipos", label: "IPO dashboard" },
  groups: [
    {
      title: "By stage",
      items: [
        { href: "/ipos?tab=open", label: "Open now", about: "Taking bids today" },
        { href: "/ipos?tab=upcoming", label: "Upcoming", about: "Dates announced, not yet open" },
        { href: "/ipos?tab=expected", label: "Expected", about: "Filed with SEBI, dates awaited" },
        { href: "/ipos?tab=closed", label: "Closed", about: "Bidding over, not yet listed" },
        { href: "/ipos?tab=listed", label: "Recently listed", about: "Listing gains and returns since" },
      ],
    },
  ],
};

const CALCULATOR_MENU: NavMenu = {
  overview: { href: "/calculators", label: `All ${META.length} calculators` },
  wide: true,
  groups: CATEGORIES.map((title) => ({
    title,
    items: META.filter((m) => m.category === title).map((m) => ({ href: `/calculators/${m.slug}`, label: m.title.replace(" calculator", "") })),
  })),
};

/** Links beside the Markets menu in the top bar. Those with a `menu` open a dropdown. */
export const TOP_LINKS: NavItem[] = [
  { href: "/screener", label: "Screener", about: "180 prebuilt fundamental and technical screens", icon: ICON.screener, menu: SCREENER_MENU },
  { href: "/ipos", label: "IPOs", about: "Open, upcoming and recently listed issues", icon: ICON.ipos, menu: IPO_MENU },
  { href: "/mutual-funds", label: "Mutual funds", about: "Categories, returns and fund details", icon: ICON.funds },
  { href: "/news", label: "News", about: "Market and company headlines", icon: ICON.news },
  { href: "/calculators", label: "Calculators", about: "SIP, EMI, tax, FD, PPF and more", icon: ICON.calculators, menu: CALCULATOR_MENU },
  { href: "/developers", label: "API", about: "REST and MCP for your AI assistant", icon: ICON.api },
];

// ── The phone menu ──────────────────────────────────────────────────────────────────────────
// Built from the lists above, so a page added to the desktop menus can't go missing here.
// test/mobile/nav.spec.ts checks every desktop and footer destination appears.

/** A row in the phone menu: a link, or (`search`) a button opening stock search. `sub` folds out beneath it. */
export type DrawerLink = {
  label: string;
  href?: string;
  about?: string;
  icon?: string;
  keywords?: string;
  search?: boolean;
  sub?: { title?: string; items: DrawerLink[] }[];
};
export type DrawerGroup = { title: string; links: DrawerLink[] };

const fromMenu = (m: NavMenu): { title: string; items: DrawerLink[] }[] => m.groups.map((g) => ({ title: g.title, items: g.items }));

/** Every destination on the site, in the groups the phone menu shows. */
export function drawerGroups(live: boolean, signedIn = false): DrawerGroup[] {
  const tools = navGroups(live).flatMap((g) => g.items);
  const tool = (href: string, keywords?: string): DrawerLink => {
    const t = tools.find((i) => i.href === href)!;
    return { href: t.href, label: t.label, about: t.about, icon: t.icon, keywords };
  };
  const top = (href: string) => TOP_LINKS.find((l) => l.href === href)!;
  return [
    {
      title: "Markets",
      links: [
        tool("/", "home market overview dashboard"),
        ...(live ? [tool("/live", "real time quotes")] : []),
        tool("/stocks", "list a to z directory companies"),
        tool("/heatmap", "treemap map"),
        tool("/sectors", "industry rotation performance"),
        tool("/signals", "technical breakout rsi macd"),
        { href: "/breadth", label: "Market breadth", about: "How many stocks rose and fell; 52-week highs and lows", icon: ICON.breadth, keywords: "advances declines" },
        tool("/valuations", "pe pb yield nifty"),
        tool("/deliveries", "delivery percentage"),
        tool("/fo-ban", "futures options ban list"),
        tool("/fii-dii", "institutional flows foreign domestic money"),
        tool("/deals", "bulk block large trades"),
        tool("/commodities", "mcx gold silver crude"),
      ],
    },
    {
      title: "Discover",
      links: [
        { href: "/screener", label: "Stock screener", about: top("/screener").about, icon: ICON.screener, keywords: "fundamental prebuilt screens all" },
        { href: "/screener?tab=technical", label: "Technical screens", about: SCREENER_MENU.groups[0].items[1].about, icon: ICON.signals, keywords: "prebuilt chart rsi" },
        { href: "/screener/custom", label: "Build your own screen", about: SCREENER_MENU.groups[1].items[0].about, icon: ICON.screener, keywords: "custom filters" },
      ],
    },
    {
      title: "Research",
      links: [
        { search: true, label: "Look up a stock", about: "Price, chart, financials, filings and peers for any company", icon: ICON.search, keywords: "individual company research stock page" },
        tool("/earnings", "results quarterly transcripts concall"),
        tool("/filings", "announcements pdf nse"),
        tool("/corporate-actions", "dividend bonus split rights buyback"),
        tool("/board-meetings"),
        tool("/events", "calendar rbi fed holidays expiry"),
      ],
    },
    {
      title: "Investments",
      links: [
        { href: "/ipos", label: "IPOs", about: top("/ipos").about, icon: ICON.ipos, keywords: "gmp subscription listing", sub: fromMenu(IPO_MENU) },
        { href: "/mutual-funds", label: top("/mutual-funds").label, about: top("/mutual-funds").about, icon: ICON.funds, keywords: "nav sip scheme aum" },
      ],
    },
    { title: "News", links: [{ href: "/news", label: "Financial and business news", about: top("/news").about, icon: ICON.news, keywords: "headlines" }] },
    {
      title: "Tools & Data",
      links: [
        { href: "/calculators", label: CALCULATOR_MENU.overview.label, about: top("/calculators").about, icon: ICON.calculators, keywords: "sip emi tax", sub: fromMenu(CALCULATOR_MENU) },
        { href: "/developers", label: "Stock market API", about: "REST access to the data on this site", icon: ICON.api, keywords: "developer rest" },
        { href: "/developers#connect", label: "MCP server", about: "Connect your AI assistant", icon: ICON.mcp, keywords: "claude chatgpt cursor connector" },
        { href: "/developers#tools", label: "Developer documentation", about: "Every tool, route and argument", icon: ICON.docs, keywords: "reference docs" },
        { href: "/settings/tokens", label: "API tokens", about: "Create and revoke your tokens", icon: ICON.token, keywords: "key account" },
      ],
    },
    {
      title: "Platform",
      links: [
        { href: "/about", label: "About", icon: ICON.about },
        { href: "/pricing", label: "Pricing", icon: ICON.pricing, keywords: "plans" },
        { href: "/contact", label: "Contact", icon: ICON.contact, keywords: "support email help" },
        { href: "/terms", label: "Terms of use", icon: ICON.legal },
        { href: "/privacy", label: "Privacy", icon: ICON.legal },
        { href: "/sitemap.xml", label: "Sitemap", icon: ICON.map },
        ...(signedIn ? [] : [{ href: "/login", label: "Sign in", icon: ICON.account, keywords: "login account" }]),
      ],
    },
  ];
}

/** Every row as one flat list with its group, for the menu's own search. */
export function flatDestinations(groups: DrawerGroup[]): (DrawerLink & { group: string })[] {
  const out: (DrawerLink & { group: string })[] = [];
  const add = (l: DrawerLink, group: string) => {
    out.push({ ...l, group });
    for (const s of l.sub ?? []) for (const i of s.items) add(i, l.label === "IPOs" ? "IPOs" : (s.title ?? group));
  };
  for (const g of groups) for (const l of g.links) add(l, g.title);
  return out;
}

/** Rows matching every word typed, those whose name matches first. */
export function findDestinations(all: (DrawerLink & { group: string })[], query: string, limit = 30) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hit = all.filter((d) => {
    const hay = `${d.label} ${d.about ?? ""} ${d.group} ${d.keywords ?? ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const inName = (d: DrawerLink) => words.every((w) => d.label.toLowerCase().includes(w));
  return [...hit.filter(inName), ...hit.filter((d) => !inName(d))].slice(0, limit);
}

/** The bottom bar on phones. `paths` also light up the tab, so a market page reads as being under Markets. */
export const BOTTOM_NAV: { href: string; label: string; icon: string; paths?: string[] }[] = [
  { href: "/", label: "Home", icon: ICON.home },
  { href: "/heatmap", label: "Markets", icon: ICON.overview, paths: ["/heatmap", "/stocks", "/stock/", "/sectors", "/signals", "/breadth", "/valuations", "/deliveries", "/fo-ban", "/fii-dii", "/deals", "/commodities", "/live"] },
  { href: "/screener", label: "Screener", icon: ICON.screener, paths: ["/screener"] },
  { href: "/ipos", label: "IPOs", icon: ICON.ipos, paths: ["/ipos"] },
];

/** Whether a phone-menu row is the page showing. */
export function drawerActive(l: DrawerLink, url: URL): boolean {
  if (!l.href) return false;
  const [pathAndQuery, hash] = l.href.split("#");
  if (hash) return false; // anchors within a page aren't pages of their own
  const path = pathAndQuery.split("?")[0];
  if (path === "/") return url.pathname === "/";
  if (l.href === "/stocks" && url.pathname.startsWith("/stock/")) return true;
  if (pathAndQuery.includes("?") || url.searchParams.has("tab")) return menuActive(pathAndQuery, url);
  return url.pathname === path || (path !== "/screener" && url.pathname.startsWith(`${path}/`));
}

export function isActive(item: NavItem, path: string): boolean {
  if (item.href === "/") return path === "/";
  return path === item.href || path.startsWith(`${item.href}/`) || !!item.match?.some((m) => path.startsWith(m));
}

/** Whether a dropdown entry is the page showing: same path, and the same `tab` (none counts as none). */
export function menuActive(href: string, url: URL): boolean {
  const [path, query] = href.split("?");
  if (url.pathname !== path) return false;
  const tab = new URLSearchParams(query ?? "").get("tab");
  return tab ? url.searchParams.get("tab") === tab : !url.searchParams.has("tab");
}
