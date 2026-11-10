import { error } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { META } from "$lib/calculators/catalog";
import { INDICES } from "$lib/indices";
import { api } from "$lib/server/api";
import { siteOrigin } from "$lib/server/origin";

const MARKET_PAGES = ["/stocks", "/screener", "/sectors", "/heatmap", "/fii-dii", "/ipos", "/breadth", "/signals", "/valuations", "/deliveries", "/deals", "/corporate-actions", "/board-meetings", "/earnings", "/events", "/filings", "/fo-ban", "/mutual-funds", "/commodities", "/news"];
const SITE_PAGES = ["/about", "/developers", "/pricing", "/contact", "/terms", "/privacy"];

const ignore = () => null;

export async function GET({ url }) {
  if (env.INVITE_ONLY === "true") error(404, "Not found");
  const origin = siteOrigin(url);
  const [index, screens, sectors] = await Promise.all([
    api<{ rows: unknown[][] }>("/api/search-index", { allowError: true }).catch(ignore),
    api<{ screens: { slug: string }[] }>("/api/screens", { allowError: true }).catch(ignore),
    api<{ sectors: { sector: string }[] }>("/v1/sectors", { allowError: true }).catch(ignore),
  ]);
  const entry = (path: string, priority: string) => `<url><loc>${origin}${path}</loc><priority>${priority}</priority></url>`;
  // A missing list only shortens this sitemap for a while. BSE-only stocks stay out: Dhan and BSE haven't answered about showing them publicly.
  const stocks = (index?.rows ?? []).map((r) => String(r[0])).filter((s) => s && !s.startsWith("BSE-"));
  const urls = [
    entry("/", "1.0"),
    entry("/calculators", "0.8"),
    ...MARKET_PAGES.map((p) => entry(p, "0.8")),
    ...INDICES.map((i) => entry(`/indices/${i.slug}`, "0.8")),
    // Without LIVE_PUBLIC this page sends signed-out visitors home.
    ...(env.LIVE_PUBLIC === "true" ? [entry("/live", "0.8")] : []),
    ...stocks.map((s) => entry(`/stock/${encodeURIComponent(s)}`, "0.7")),
    ...(sectors?.sectors ?? []).filter((s) => s.sector).map((s) => entry(`/sectors/${encodeURIComponent(s.sector)}`, "0.6")),
    ...(screens?.screens ?? []).map((s) => entry(`/screener/${encodeURIComponent(s.slug)}`, "0.6")),
    ...META.map((m) => entry(`/calculators/${m.slug}`, "0.7")),
    ...SITE_PAGES.map((p) => entry(p, "0.3")),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=21600" } });
}
