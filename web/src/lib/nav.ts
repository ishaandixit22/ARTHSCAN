// Site navigation. Every market tool lives behind one "Markets" menu, grouped
// as Market, Flows and Companies, so the top bar carries three links instead of
// fourteen.

export type NavItem = { href: string; label: string; about: string; icon: string; match?: string[] };

// 24×24 outline icons (1.6px stroke), one per destination, drawn for what each tool shows.
const ICON = {
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
  api: "M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15",                          // code brackets
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
        { href: "/heatmap", label: "Heatmap", about: "The 250 most traded stocks by sector", icon: ICON.heatmap },
        { href: "/sectors", label: "Sector rotation", about: "Returns and leadership by sector", icon: ICON.sectors },
        { href: "/signals", label: "Signals", about: "Breakouts, crosses, RSI and volume spikes", icon: ICON.signals },
        { href: "/valuations", label: "Market valuation", about: "Index P/E, P/B and yield history", icon: ICON.valuations },
        { href: "/deliveries", label: "Top deliveries", about: "Where buyers took delivery", icon: ICON.deliveries },
      ],
    },
    {
      title: "Flows",
      items: [
        { href: "/fii-dii", label: "FII / DII data", about: "Foreign and domestic flows, by sector", icon: ICON.flows },
        { href: "/mutual-funds", label: "Mutual funds", about: "Categories, returns and fund details", icon: ICON.funds },
        { href: "/ipos", label: "IPOs", about: "Open, upcoming and recently listed issues", icon: ICON.ipos },
      ],
    },
    {
      title: "Companies",
      items: [
        { href: "/stocks", label: "All stocks", about: "Every NSE stock, A to Z", icon: ICON.stocks, match: ["/stock/"] },
        { href: "/screener", label: "Screener", about: "Filter by price, returns and fundamentals", icon: ICON.screener },
        { href: "/news", label: "News", about: "Market and company headlines", icon: ICON.news },
      ],
    },
  ];
}

/** Plain links beside the Markets menu in the top bar. */
export const TOP_LINKS: NavItem[] = [
  { href: "/news", label: "News", about: "Market and company headlines", icon: ICON.news },
  { href: "/developers", label: "API", about: "REST and MCP for your AI assistant", icon: ICON.api },
];

export function isActive(item: NavItem, path: string): boolean {
  if (item.href === "/") return path === "/";
  return path === item.href || path.startsWith(`${item.href}/`) || !!item.match?.some((m) => path.startsWith(m));
}
