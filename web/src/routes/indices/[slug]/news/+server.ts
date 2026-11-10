// The index page's News section, fetched by the browser so a slow news provider never holds up the page.
// Recent headlines about the index's heaviest companies (each company's digest, cached for hours and shared
// with stock pages), plus market headlines that name the index or one of its companies.

import { json } from "@sveltejs/kit";
import { api, ext } from "$lib/server/api";
import { indexBySlug } from "$lib/indices";
import { recentNews } from "$lib/recent-news";

const TOP = 6;
const MAX = 14;
const GENERIC = new Set(["india", "indian", "bharat", "bank", "the", "national", "state", "general", "power", "life", "max", "union", "central", "punjab", "global", "united", "first"]);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const iso = (s: string | null | undefined) => (s ? s.replace(/\+0000$/, "Z") : null);

type Item = { title: string; url: string; summary: string | null; source: string | null; date: string | null; image: string | null; tag: string; symbol: string | null };

export async function GET({ params, setHeaders }) {
  const info = indexBySlug(params.slug);
  if (!info) return json({ error: "unknown index" }, { status: 404 });

  const members = info.heatmap ? await api(`/v1/market/index-constituents?index=${info.heatmap}`, { allowError: true }).catch(() => null) : null;
  const rows = (members?.constituents ?? []) as { symbol: string; name: string }[];
  const top = rows.slice(0, TOP); // already heaviest first

  const [market, ...digests] = await Promise.all([
    ext<any[]>("/news"),
    ...top.map((r) => ext<{ news?: { headline: string; url: string; date?: string | null; summary?: string | null; image?: string | null }[] }>(`/digest?stock=${encodeURIComponent(r.symbol)}`)),
  ]);

  const items: Item[] = [];
  top.forEach((r, i) => {
    for (const n of recentNews(digests[i].data?.news ?? []).slice(0, 3)) {
      items.push({ title: n.headline, url: n.url, summary: n.summary ?? null, source: "Mint", date: iso(n.date), image: n.image ?? null, tag: r.symbol, symbol: r.symbol });
    }
  });

  // Whole words only, so a short name doesn't match inside another word.
  const words = [...info.news, ...rows.flatMap((c) => [c.name.replace(/\b(limited|ltd\.?)$/i, "").trim().split(/\s+/)[0] ?? "", c.symbol])]
    .filter((w) => (w.length >= 4 || info.news.includes(w)) && !GENERIC.has(w.toLowerCase()));
  const pattern = words.length ? new RegExp(`\\b(${words.map(esc).join("|")})\\b`, "i") : null;
  for (const n of market.data ?? []) {
    if (pattern?.test(`${n.title ?? ""} ${n.summary ?? ""}`)) {
      items.push({ title: n.title, url: n.url, summary: n.summary ?? null, source: n.source ?? null, date: iso(n.pub_date), image: n.image_url ?? null, tag: info.short, symbol: null });
    }
  }

  const seen = new Set<string>();
  const out = items
    .filter((n) => n.title && n.url && !seen.has(n.url) && !!seen.add(n.url))
    .sort((a, z) => (Date.parse(z.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0))
    .slice(0, MAX);
  setHeaders({ "cache-control": "public, max-age=600" });
  return json({ items: out, companies: top.map((r) => r.symbol), error: out.length ? null : (market.error ?? null) });
}
