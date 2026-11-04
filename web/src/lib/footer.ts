// What the site footer lists. Only pages that exist go in the columns. The two lists at the
// bottom start empty and show nothing until they have entries:
//
// SOCIALS: the accounts Arthscan really has.
// LISTINGS: directories where a listing is live and has been checked. Never add one before that,
// and keep the badges few: dozens of outgoing badge links on every page look like a link scheme.

import { META } from "$lib/calculators/catalog";

export type FooterColumn = { title: string; links: { href: string; label: string }[] };

const popular = ["sip", "emi", "income-tax", "ppf", "fd", "home-loan"];

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: "Markets",
    links: [
      { href: "/stocks", label: "All stocks A–Z" },
      { href: "/sectors", label: "Stocks by sector" },
      { href: "/screener", label: "Stock screener" },
      { href: "/heatmap", label: "Market heatmap" },
      { href: "/signals", label: "Signals" },
      { href: "/fii-dii", label: "FII / DII data" },
      { href: "/deals", label: "Bulk and block deals" },
      { href: "/commodities", label: "Commodities" },
    ],
  },
  {
    title: "Research",
    links: [
      { href: "/ipos", label: "IPOs" },
      { href: "/mutual-funds", label: "Mutual funds" },
      { href: "/earnings", label: "Earnings tracker" },
      { href: "/filings", label: "Company filings" },
      { href: "/corporate-actions", label: "Corporate actions" },
      { href: "/board-meetings", label: "Board meetings" },
      { href: "/events", label: "Events calendar" },
      { href: "/news", label: "News" },
    ],
  },
  {
    title: "Calculators",
    links: [
      { href: "/calculators", label: `All ${META.length} calculators` },
      ...popular.map((slug) => ({ href: `/calculators/${slug}`, label: META.find((m) => m.slug === slug)!.title.replace(" calculator", "") })),
    ],
  },
  {
    title: "Arthscan",
    links: [
      { href: "/about", label: "About" },
      { href: "/pricing", label: "Pricing" },
      { href: "/developers", label: "Stock market API and MCP" },
      { href: "/contact", label: "Contact" },
      { href: "/terms", label: "Terms of use" },
      { href: "/privacy", label: "Privacy" },
      { href: "/sitemap.xml", label: "Sitemap" },
    ],
  },
];

export const SOCIALS: { href: string; label: string }[] = [];
export const LISTINGS: { href: string; name: string; badge?: string }[] = [];
