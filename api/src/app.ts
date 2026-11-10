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
import { live } from "./routes/live.js";
import { searchIndex } from "./routes/search-index.js";
import { admin } from "./routes/admin.js";
import { screens } from "./routes/screens.js";
import { jsonError } from "./lib/http.js";
import { edgeCache } from "./middleware/edge-cache.js";
import { type CheckReport, freshness } from "./jobs/check.js";
import { dataProblems, watchdogState } from "./jobs/watchdog.js";

export const app = new Hono<AppEnv>();

// API responses are JSON, never meant to be framed or sniffed.
app.use("*", async (c, next) => {
  await next();
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
});
app.use("*", resolvePrincipal());
app.use("/v1/*", edgeCache());

app.get("/", (c) => c.json({ ok: true, service: SERVER_INFO.name, version: SERVER_INFO.version, rest: "/v1", mcp: "/mcp" }));
app.get("/health", async (c) => {
  // Dates only, nothing private: lets the daily report and any uptime monitor see a stale dataset.
  const [fresh, check, state, refreshes] = await Promise.all([
    freshness(c.env),
    c.env.DB.prepare("SELECT body FROM external_cache WHERE key = 'health:last_check'").first<{ body: string }>(),
    watchdogState(c.env),
    // The last few attempts at loading prices, so a miss can be explained from outside.
    c.env.DB.prepare("SELECT job, target, status, rows, message, created_at FROM pipeline_runs WHERE job IN ('daily:prices', 'watchdog') ORDER BY id DESC LIMIT 6").all(),
  ]);
  const last = check ? (JSON.parse(check.body) as CheckReport) : null;
  const problems = dataProblems(fresh, state, last?.latest_published ?? null);
  return c.json({
    ok: problems.length === 0, problems, latest_price_date: fresh.prices ?? null, datasets: fresh,
    watchdog: state && { date: state.date, status: state.status, message: state.message, checked_at: state.checked_at },
    recent_refreshes: refreshes.results,
    last_check: last && { at: last.at, latest_published: last.latest_published, latest_loaded: last.latest_loaded, items: last.items },
  });
});

app.route("/", oauth); // /.well-known/* and /oauth/*
app.route("/api/oauth", oauthAccount);
app.route("/api/live", live);
app.route("/api/search-index", searchIndex);
app.route("/api/admin", admin);
app.route("/api/screens", screens);
app.route("/api", account);
app.route("/v1", rest);
app.route("/mcp", mcp);

app.notFound((c) => jsonError(c, 404, "E_NOT_FOUND", "No such route."));
app.onError((err, c) => {
  console.error("unhandled:", err);
  return jsonError(c, 500, "E_INTERNAL", "Internal error.");
});
