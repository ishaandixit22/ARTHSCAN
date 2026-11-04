import { error } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { META } from "$lib/calculators/catalog";
import { api } from "$lib/server/api";
import { siteOrigin } from "$lib/server/origin";

// Every public page: sections, sectors and one entry per traded stock (~3,500).
// Not served while the site is invite-only — there's nothing for crawlers to see.
export async function GET({ url }) {
  if (env.INVITE_ONLY === "true") error(404, "Not found");
  const origin = siteOrigin(url);

  const stocks: { symbol: string; as_of: string }[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = await api(`/v1/stocks?limit=500&offset=${offset}`);
    stocks.push(...page.results);
    if (stocks.length >= page.total || !page.results.length) break;
  }
  const { sectors } = await api("/v1/sectors");
  // Stocks listed only on BSE aren't in the /v1/stocks list; the search table carries them.
  const { rows } = await api<{ rows: unknown[][] }>("/api/search-index");
  const bseOnly = rows.map((r) => String(r[0])).filter((s) => s.startsWith("BSE-"));
  const latest = stocks.reduce((d, s) => (s.as_of > d ? s.as_of : d), "");

  const entry = (path: string, lastmod?: string, priority?: string) =>
    `<url><loc>${origin}${path}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}${priority ? `<priority>${priority}</priority>` : ""}</url>`;
  const esc = (s: string) => encodeURIComponent(s).replace(/'/g, "%27");

  const urls = [
    entry("/", latest, "1.0"),
    ...["/stocks", "/sectors", "/screener", "/fii-dii", "/fo-ban", "/events", "/breadth", "/earnings", "/filings", "/corporate-actions", "/board-meetings", "/deals", "/commodities", "/news", "/ipos", "/mutual-funds", "/developers"].map((p) => entry(p, latest, "0.8")),
    ...["/about", "/pricing", "/contact", "/terms", "/privacy"].map((p) => entry(p, undefined, "0.3")),
    entry("/calculators", undefined, "0.8"),
    ...META.map((m) => entry(`/calculators/${m.slug}`, undefined, "0.7")),
    ...sectors.map((s: { sector: string }) => entry(`/sectors/${esc(s.sector)}`, latest, "0.6")),
    ...stocks.map((s) => entry(`/stock/${esc(s.symbol)}`, s.as_of, "0.5")),
    ...bseOnly.map((s) => entry(`/stock/${esc(s)}`, latest, "0.4")),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=21600" } });
}
