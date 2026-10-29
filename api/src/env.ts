import type { Database } from "./db/types.js";

// Mirrors what a Cloudflare Worker gets as `env`: the DB binding plus vars and
// secrets. Locally server.ts builds this from process.env.
export interface Env {
  DB: Database;
  PUBLIC_SITE_ORIGIN: string;
  TOKEN_PEPPER: string;
  INTERNAL_API_KEY: string;
  FREE_DAILY_QUOTA: string;
  AUTH_DEV_LOGIN?: string;
  /** "true" = private beta: only emails in the invites table can sign in or use tokens. */
  INVITE_ONLY?: string;
  /** Who sees Dhan live prices: "off", "owner" (OWNER_EMAILS only) or "invited" (every signed-in user). */
  LIVE_ACCESS?: string;
  /** Comma-separated owner emails, for LIVE_ACCESS="owner" and owner-only settings. */
  OWNER_EMAILS?: string;
  /** Dhan live feed. Client id and token are secrets; the URL can point at a test server. */
  DHAN_CLIENT_ID?: string;
  DHAN_ACCESS_TOKEN?: string;
  DHAN_FEED_URL?: string;
  /** Indian Stock API (indianapi.in) key, a secret. Its tools answer 503 until it is set. */
  INDIANAPI_KEY?: string;
  INDIANAPI_BASE_URL?: string;
  /** Durable Object namespace for the live feed (Cloudflare only; absent on the Node server). */
  LIVE_FEED?: { idFromName(name: string): unknown; get(id: unknown): { fetch(req: Request): Promise<Response> } };
  /** When set, dev sign-in also needs this code — required before exposing the site publicly. */
  AUTH_DEV_LOGIN_CODE?: string;
  GOOGLE_OAUTH_ENABLED?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

export interface Account {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  plan: string;
}

export type Principal =
  | { kind: "token"; account: Account; tokenId: string }
  | { kind: "session"; account: Account }
  | { kind: "internal" };

export type AppEnv = {
  Bindings: Env;
  // bearerRejected: a Bearer credential was sent but matched no live token, so
  // MCP can answer 401 invalid_token and the client knows to refresh.
  Variables: { principal: Principal | null; bearerRejected: boolean };
};
