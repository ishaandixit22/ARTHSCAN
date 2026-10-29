// Local Node entry point. Builds the Worker-style env from process.env.

import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { openDatabase } from "./db/sqlite.js";
import type { Env } from "./env.js";

const env: Env = {
  DB: openDatabase(),
  PUBLIC_SITE_ORIGIN: process.env.PUBLIC_SITE_ORIGIN ?? "http://localhost:5173",
  TOKEN_PEPPER: process.env.TOKEN_PEPPER ?? "dev-pepper",
  INTERNAL_API_KEY: process.env.INTERNAL_API_KEY ?? "",
  FREE_DAILY_QUOTA: process.env.FREE_DAILY_QUOTA ?? "50",
  AUTH_DEV_LOGIN: process.env.AUTH_DEV_LOGIN,
  INVITE_ONLY: process.env.INVITE_ONLY,
  AUTH_DEV_LOGIN_CODE: process.env.AUTH_DEV_LOGIN_CODE,
  GOOGLE_OAUTH_ENABLED: process.env.GOOGLE_OAUTH_ENABLED,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  INDIANAPI_KEY: process.env.INDIANAPI_KEY,
  INDIANAPI_BASE_URL: process.env.INDIANAPI_BASE_URL,
};

const port = Number(process.env.API_PORT ?? 8787);
serve({ fetch: (req) => app.fetch(req, env), port }, () => {
  console.log(`Arthscan API on http://localhost:${port}  (REST /v1, MCP /mcp)`);
});
