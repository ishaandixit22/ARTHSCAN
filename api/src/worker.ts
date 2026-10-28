// Cloudflare Workers entry. Same Hono app as server.ts; here `env` comes from
// the Worker bindings (D1 as DB, vars and secrets from wrangler.jsonc).

import { app } from "./app.js";
import type { Env } from "./env.js";

export default {
  fetch: (request: Request, env: Env, ctx: unknown) => app.fetch(request, env, ctx as never),
};
