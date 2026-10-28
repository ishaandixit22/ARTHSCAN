// Resolves who is calling. Order: internal key (the website's own server),
// bearer API token (MCP/REST users), then session cookie (signed-in browser).
// Never rejects by itself — routes decide what they require. In invite-only
// mode an account whose invite is gone resolves to nobody.

import type { MiddlewareHandler } from "hono";
import type { Account, AppEnv } from "../env.js";
import { hashToken, secretEquals } from "../lib/crypto.js";
import { parseCookies, SESSION_COOKIE } from "../lib/cookie.js";
import { isInvited } from "../lib/access.js";

export function resolvePrincipal(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set("principal", null);
    c.set("bearerRejected", false);
    const env = c.env;

    const internal = c.req.header("x-internal-key");
    if (internal && env.INTERNAL_API_KEY && (await secretEquals(internal, env.INTERNAL_API_KEY))) {
      c.set("principal", { kind: "internal" });
      // The website's server forwards the visitor's cookie too; prefer that identity when present.
    }

    const auth = c.req.header("authorization");
    if (auth?.toLowerCase().startsWith("bearer ")) {
      const token = auth.slice(7).trim();
      const row = await env.DB.prepare(`
        SELECT t.id AS token_id, a.id, a.name, a.email, a.avatar_url, a.plan
        FROM api_tokens t JOIN accounts a ON a.id = t.account_id
        WHERE t.token_hash = ? AND t.revoked_at IS NULL`).bind(await hashToken(token, env.TOKEN_PEPPER)).first<Account & { token_id: string }>();
      if (row && (await isInvited(env, row.email))) {
        const { token_id, ...account } = row;
        c.set("principal", { kind: "token", account, tokenId: token_id });
        await env.DB.prepare("UPDATE api_tokens SET last_used_at = datetime('now') WHERE id = ?").bind(token_id).run();
        return next();
      }
      // Not a personal token: try an OAuth access token (remote MCP connectors).
      const grant = await env.DB.prepare(`
        SELECT g.id AS grant_id, a.id, a.name, a.email, a.avatar_url, a.plan
        FROM oauth_tokens g JOIN accounts a ON a.id = g.account_id
        WHERE g.access_hash = ? AND g.revoked_at IS NULL AND g.access_expires_at > datetime('now')`)
        .bind(await hashToken(token, env.TOKEN_PEPPER)).first<Account & { grant_id: string }>();
      if (grant && (await isInvited(env, grant.email))) {
        const { grant_id, ...account } = grant;
        c.set("principal", { kind: "token", account, tokenId: grant_id });
        await env.DB.prepare("UPDATE oauth_tokens SET last_used_at = datetime('now') WHERE id = ?").bind(grant_id).run();
      } else {
        c.set("bearerRejected", true);
      }
      return next();
    }

    const sid = parseCookies(c.req.header("cookie"))[SESSION_COOKIE];
    if (sid) {
      const account = await env.DB.prepare(`
        SELECT a.id, a.name, a.email, a.avatar_url, a.plan FROM sessions s JOIN accounts a ON a.id = s.account_id
        WHERE s.id = ? AND s.revoked_at IS NULL AND s.expires_at > datetime('now')`).bind(sid).first<Account>();
      if (account && (await isInvited(env, account.email))) c.set("principal", { kind: "session", account });
    }
    return next();
  };
}

export function requireSession(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (c.get("principal")?.kind !== "session") {
      return c.json({ ok: false, error: { code: "E_SIGN_IN", message: "Sign in required." } }, 401);
    }
    return next();
  };
}
