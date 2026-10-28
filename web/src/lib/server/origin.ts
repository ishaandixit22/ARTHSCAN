import { env } from "$env/dynamic/private";

/** The site's public address (the tunnel URL when testing), for links shown to users. */
export const siteOrigin = (url: URL) => (env.PUBLIC_SITE_ORIGIN ?? url.origin).replace(/\/$/, "");
