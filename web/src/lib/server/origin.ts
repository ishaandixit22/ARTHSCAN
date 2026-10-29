import { env } from "$env/dynamic/public";

// PUBLIC_-prefixed variables live in SvelteKit's public env, never the private one.
/** The site's public address, for links shown to users (connector URLs, sitemap). */
export const siteOrigin = (url: URL) => (env.PUBLIC_SITE_ORIGIN ?? url.origin).replace(/\/$/, "");
