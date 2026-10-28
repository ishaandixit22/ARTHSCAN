import { env } from "$env/dynamic/private";
import { siteOrigin } from "$lib/server/origin";

// Private beta: keep crawlers out entirely. Public: point them at the sitemap.
export function GET({ url }) {
  const body =
    env.INVITE_ONLY === "true"
      ? "User-agent: *\nDisallow: /\n"
      : `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /settings/\nDisallow: /connect/\n\nSitemap: ${siteOrigin(url)}/sitemap.xml\n`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
