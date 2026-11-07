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
  /** "public" shows stocks listed only on BSE (pages, search, sitemap). Anything else hides them at once. */
  BSE_PAGES?: string;
  /** Comma-separated owner emails, for LIVE_ACCESS="owner" and owner-only settings. */
  OWNER_EMAILS?: string;
  /** Dhan live feed. Client id and token are secrets; the URL can point at a test server. */
  DHAN_CLIENT_ID?: string;
  DHAN_ACCESS_TOKEN?: string;
  DHAN_FEED_URL?: string;
  /** Indian Stock API (indianapi.in) key, a secret. Its tools answer 503 until it is set. */
  INDIANAPI_KEY?: string;
  /** Alerts and the daily health summary (lib/notify.ts). Each channel is skipped while its settings are missing. */
  RESEND_API_KEY?: string;
  ALERT_EMAIL_TO?: string;
  ALERT_EMAIL_FROM?: string;
  CALLMEBOT_PHONE?: string;
  CALLMEBOT_APIKEY?: string;
  INDIANAPI_BASE_URL?: string;
  /** Provider requests the background statement fill may spend per day (default 300; raise it to match the plan). */
  STATEMENTS_DAILY_MAX?: string;
  /** ipoguru.in key, a secret: IPO calendar, premium, subscription and company data. Its plan decides what /ipos can show. */
  IPOGURU_API_KEY?: string;
  /** ipoalerts.in key, a secret: grey-market premium for the IPO board. Without it the premium fields stay empty. */
  IPOALERTS_API_KEY?: string;
  /** Seconds a fetched premium list is reused (default 900). */
  IPOALERTS_TTL?: string;
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
