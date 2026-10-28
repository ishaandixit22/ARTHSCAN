import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { loadEnv } from "vite";

const env = loadEnv(process.env.NODE_ENV === "production" ? "production" : "development", "..", "");

// adapter-node for local runs. Moving to Cloudflare later is a swap to
// @sveltejs/adapter-cloudflare here (agentdraft's dashboard shows the setup).
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    env: { dir: ".." },
    // Behind a tunnel the dev server sees http:// while the browser sends an
    // https:// Origin, so form posts need the public origin trusted explicitly.
    csrf: { trustedOrigins: env.PUBLIC_SITE_ORIGIN ? [env.PUBLIC_SITE_ORIGIN.replace(/\/$/, "")] : [] },
  },
};
