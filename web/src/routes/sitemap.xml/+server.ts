import { error } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { META } from "$lib/calculators/catalog";
import { siteOrigin } from "$lib/server/origin";

// Only the pages that open without signing in: anything else sends crawlers to the sign-in page.
export async function GET({ url }) {
  if (env.INVITE_ONLY === "true") error(404, "Not found");
  const origin = siteOrigin(url);

  const entry = (path: string, priority: string) => `<url><loc>${origin}${path}</loc><priority>${priority}</priority></url>`;
  const urls = [
    entry("/", "1.0"),
    entry("/calculators", "0.8"),
    ...META.map((m) => entry(`/calculators/${m.slug}`, "0.7")),
    ...["/terms", "/privacy"].map((p) => entry(p, "0.3")),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=21600" } });
}
