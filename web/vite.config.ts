import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "..", "");
  const API = env.API_URL ?? "http://localhost:8787";
  const publicHost = env.PUBLIC_SITE_ORIGIN ? new URL(env.PUBLIC_SITE_ORIGIN).hostname : "localhost";

  // One origin in dev: the browser talks to :5173 and the API routes are proxied,
  // so the session cookie set by /api is visible to the site (same as one domain in prod).
  return {
    plugins: [sveltekit()],
    server: {
      // Vite rejects unknown Host headers; allow the public test URL (npm run tunnel).
      allowedHosts: [publicHost, ".trycloudflare.com"],
      proxy: {
        "/api": API,
        "/v1": API,
        "/mcp": API,
        "/health": API,
        "/oauth": API,
        "/.well-known": API,
      },
    },
  };
});
