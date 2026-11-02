import adapter from "@sveltejs/adapter-cloudflare";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { loadEnv } from "vite";

const env = loadEnv(process.env.NODE_ENV === "production" ? "production" : "development", "..", "");

export default {
  preprocess: vitePreprocess(),
  kit: {
    // Builds a Cloudflare Worker (see wrangler.jsonc). `npm run dev:web` still
    // runs plain Vite, proxying API paths to the local Node API.
    adapter: adapter(),
    env: { dir: ".." },
    // Behind a tunnel the dev server sees http:// while the browser sends an
    // https:// Origin, so form posts need the public origin trusted explicitly.
    csrf: { trustedOrigins: env.PUBLIC_SITE_ORIGIN ? [env.PUBLIC_SITE_ORIGIN.replace(/\/$/, "")] : [] },
    // Scripts only from this origin plus SvelteKit's hydration script, allowed by its hash:
    // a nonce would be replayed by every visitor once a page is served from the edge cache.
    // style-src needs 'unsafe-inline' for Svelte style attributes (bar widths,
    // chart colours). No form-action: the OAuth consent form must be able to
    // redirect to the connecting app (claude.ai, chatgpt.com).
    csp: {
      mode: "hash",
      directives: {
        "default-src": ["self"],
        // Cloudflare Web Analytics: its beacon script and where that script reports.
        "script-src": ["self", "https://static.cloudflareinsights.com"],
        "style-src": ["self", "unsafe-inline"],
        "font-src": ["self"],
        // News thumbnails come from many publishers' image hosts; images can't run code.
        "img-src": ["self", "data:", "https:"],
        "connect-src": ["self", "https://cloudflareinsights.com"],
        "object-src": ["none"],
        "base-uri": ["self"],
        "frame-ancestors": ["none"],
      },
    },
  },
};
