// REST mirror of every tool: GET /v1/<route>, query string = arguments.
// POST with a JSON body works too, for array/object arguments like screener filters.

import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import { callTool } from "../handlers/call.js";
import { TOOLS } from "../handlers/tools.js";
import { jsonError } from "../lib/http.js";

export const rest = new Hono<AppEnv>();

rest.get("/", (c) =>
  c.json({
    ok: true,
    endpoints: TOOLS.map((t) => ({ tool: t.name, method: "GET", path: `/v1${t.route}`, description: t.description, metered: t.metered })),
  }),
);

for (const tool of TOOLS) {
  const run = async (c: any, body: Record<string, unknown>) => {
    const args = { ...c.req.query(), ...body, ...c.req.param() };
    const r = await callTool(c.env, c.get("principal"), "rest", tool.name, args);
    if (r.usage) {
      c.header("X-RateLimit-Limit", String(r.usage.limit));
      c.header("X-RateLimit-Remaining", String(Math.max(0, r.usage.limit - r.usage.used)));
    }
    if (!r.ok) return jsonError(c, r.status, r.code, r.message);
    return c.json({ ok: true, data: r.data });
  };
  rest.get(tool.route, (c) => run(c, {}));
  rest.post(tool.route, async (c) => {
    let body: Record<string, unknown> = {};
    try {
      body = await c.req.json();
    } catch {
      /* empty body is fine */
    }
    return run(c, body && typeof body === "object" ? body : {});
  });
}
