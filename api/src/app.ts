// The whole backend as one Hono app: website account API (/api), REST (/v1),
// MCP (/mcp) and the OAuth server that guards it (/oauth, /.well-known). Runtime-agnostic — server.ts serves it on Node today; a
// Cloudflare Worker can `export default app` with a D1 binding later.

import { Hono } from "hono";
import type { AppEnv } from "./env.js";
import { resolvePrincipal } from "./middleware/auth.js";
import { account } from "./routes/account.js";
import { rest } from "./routes/rest.js";
import { mcp, SERVER_INFO } from "./mcp/server.js";
import { oauth, oauthAccount } from "./routes/oauth.js";
import { jsonError } from "./lib/http.js";

export const app = new Hono<AppEnv>();

app.use("*", resolvePrincipal());

app.get("/", (c) => c.json({ ok: true, service: SERVER_INFO.name, version: SERVER_INFO.version, rest: "/v1", mcp: "/mcp" }));
app.get("/health", async (c) => {
  const row = await c.env.DB.prepare("SELECT MAX(date) AS latest_price_date FROM daily_prices").first();
  return c.json({ ok: true, ...row });
});

app.route("/", oauth); // /.well-known/* and /oauth/*
app.route("/api/oauth", oauthAccount);
app.route("/api", account);
app.route("/v1", rest);
app.route("/mcp", mcp);

app.notFound((c) => jsonError(c, 404, "E_NOT_FOUND", "No such route."));
app.onError((err, c) => {
  console.error("unhandled:", err);
  return jsonError(c, 500, "E_INTERNAL", "Internal error.");
});
