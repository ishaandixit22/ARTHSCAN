# Arthscan — Indian stock research platform (arthscan.me)

Phase 1 of the build plan: an NSE research website, a REST API and an MCP server,
all reading one shared data layer. The brand lives in `web/src/lib/brand.ts` and
`api/src/mcp/server.ts`.

```
                 ┌──────────── web/ (SvelteKit) ────────────┐
 Browser ───────▶│ pages: markets, stock, A–Z, sectors,     │── internal key (unmetered) ─┐
                 │ screener, FII/DII, sign-in, tokens, docs │                             │
                 └──────────────────────────────────────────┘                             ▼
 claude.ai/ChatGPT ─ OAuth ─┐
 Claude / Cursor ── Bearer token ──▶ /mcp  ┐                         ┌──────────────────────────┐
 Scripts ────────── Bearer token ──▶ /v1/* ├─▶ api/ (Hono) callTool ─▶│ handlers/tools.ts (15)   │──▶ SQLite / D1
                                           ┘   auth · 50/day quota   └──────────────────────────┘      ▲
                                                                                                        │
 pipeline/ ── NSE public files (bhavcopy, equity lists, index lists) + file imports ───────────────────┘
```

Every feature is one entry in `api/src/handlers/tools.ts`. That single definition
becomes an MCP tool, a REST route (`/v1/...`) and the data source for a web page.

## Run it locally

Needs Node 22.5+ (uses the built-in `node:sqlite`).

```bash
npm install
cp .env.example .env        # already done once; edit secrets for anything shared
npm run data:stocks         # stock master + sectors
npm run data:backfill       # ~1 year of daily prices (≈5 min, cached in data/cache)
npm run dev:api             # http://localhost:8787
npm run dev:web             # http://localhost:5173  (proxies /api, /v1, /mcp to the API)
```

Daily update (run on weekdays after ~7 pm IST, when NSE publishes the bhavcopy):

```bash
npm run data:daily
```

### Public test URL (try the connector from claude.ai / ChatGPT)

```bash
npm run tunnel              # prints https://<random>.trycloudflare.com and updates PUBLIC_SITE_ORIGIN in .env
# then restart dev:api and dev:web so they pick up the new origin
```

Add `<url>/mcp` as a custom connector in claude.ai or ChatGPT. Uses Cloudflare's free quick
tunnel (no account; `bin/cloudflared`, git-ignored). The URL changes every run and stops when the
tunnel stops; Ctrl-C resets `.env` to localhost. Because the dev sign-in trusts any typed email, the
script sets `AUTH_DEV_LOGIN_CODE` in `.env` if it's empty — testers need that code to sign in.
Showing NSE data to the public needs the exchange licence, so share the URL only with invited testers.

Tests: `npm test` (API: MCP protocol, REST, screener validation, quota, token revocation, split adjustment).

## What's in Phase 1

| Plan item | Status |
|---|---|
| Daily price pipeline + 1-year backfill | Done — NSE UDiFF bhavcopy, ~3,400 stocks/day, weekend special sessions included |
| Stock master, sectors | Done — NSE equity + SME lists; sectors from Nifty Total Market + Microcap 250 lists (~1,000 stocks tagged) |
| Split/bonus adjustment | Done — detected from the price series (bhavcopy is unadjusted); `price_adjustments` table, `source='manual'` rows override |
| Shared handlers, MCP server, REST | Done — 15 tools; MCP Streamable HTTP (stateless JSON) at `/mcp`; REST at `/v1` |
| Website: home, stock page, A–Z, sectors, screener, FII/DII | Done |
| Sign-in, API tokens page, 50 calls/day | Done — Google OAuth (dormant until configured) + local dev sign-in; peppered-hash tokens; atomic per-day quota |
| Financials, shareholding | Schema, tools and UI done; **data must be imported** (see `pipeline/README.md`) |
| FII/DII | Page and tools done; **daily figures are imported from a file** (see below) |
| OAuth for claude.ai / ChatGPT remote connectors | Done — MCP auth spec: protected-resource + authorization-server metadata, dynamic client registration, PKCE S256, 1-hour access / rotating 30-day refresh tokens, consent page at `/connect/<id>`, "Connected apps" with disconnect. Needs a public HTTPS URL before claude.ai/ChatGPT can reach it |

### Data limits to know

- **FII/DII is not auto-fetched.** NSE serves it only from a cookie-protected JSON API; scripting
  around that was deliberately left out. Download the day's file from NSE's "FII/DII trading
  activity" page and run `npm run data:import -- fii-dii <file>`. One day (28 Oct 2026) is loaded.
- **No market cap.** Shares outstanding isn't in the free files; it arrives with the financials feed.
- **Financials need XBRL parsing or a vendor** (the plan's TrueData quote). The importer takes a
  simple CSV so either source can feed it.
- End-of-day only. Showing exchange data publicly needs NSE's display licence (see the plan).

## Production on Cloudflare (arthscan.me)

```
 arthscan.me/*                         → arthscan-web Worker (SvelteKit, custom domain)
 arthscan.me/{api,v1,mcp,oauth,.well-known,health}
                                       → arthscan-api Worker (path routes, run first)
 web → api page loads                  → service binding (no public hop)
 arthscan-api                          → D1 database "arthscan"
```

The pipeline still runs against local SQLite; `npm run d1:push` publishes to D1.

Rehearse locally with the real Workers runtime (local D1, no Cloudflare account needed):

```bash
(cd api && npx wrangler d1 migrations apply arthscan --local)
npm run d1:push -- seed --local
npm run cf:dev                    # both Workers on http://localhost:8787 (secrets from */.dev.vars)
```

First deploy (needs the domain active on Cloudflare and `npx wrangler login`):

```bash
cd api && npx wrangler d1 create arthscan     # copy database_id into api/wrangler.jsonc
npx wrangler d1 migrations apply arthscan --remote
npx wrangler secret put TOKEN_PEPPER          # new random value, never reuse the local one
npx wrangler secret put INTERNAL_API_KEY      # same value for both Workers
(cd ../web && npx wrangler secret put INTERNAL_API_KEY)
cd .. && npm run d1:push -- seed              # ~110 MB of market data
npm run cf:deploy                             # API first (the website binds to it), then website
```

Every trading day after the local pipeline: `npm run data:daily && npm run d1:push -- sync` (about 15k row writes; add `--fundamentals` after importing results).

Sign-in in production is Google only (`AUTH_DEV_LOGIN` is false). Create an OAuth client in
Google Cloud Console (Web application, redirect URI `https://arthscan.me/api/auth/google/callback`),
put its client ID in `GOOGLE_CLIENT_ID` in `api/wrangler.jsonc` (it is public), run
`wrangler secret put GOOGLE_CLIENT_SECRET` in `api/`, and set `GOOGLE_OAUTH_ENABLED` to `"true"`.

## Indian Stock API (indianapi.in)

`api/src/handlers/market-data.ts` adds 18 tools under `/v1/ext/*` (and MCP): intraday stock
profile, trending, most active, price shockers, 52-week extremes, news, IPOs, commodities,
corporate actions, announcements, financial statements, valuation history, analyst forecasts and
target price, industry search and mutual funds. They accept an NSE symbol or a company name.
Answers are cached in `external_cache` (migration 0009) for 5 minutes to 24 hours per endpoint, so
repeat calls don't spend the vendor plan. Set `INDIANAPI_KEY` in `.env` locally and
`wrangler secret put INDIANAPI_KEY` in `api/` for production; until then these tools answer 503.

## Live prices (Dhan)

During market hours, accounts with live access see prices update as trades happen: on stock pages
and on `/live` (the 50 most traded stocks). Source: Dhan's live market feed v2, through the owner's
Dhan Data API subscription (₹499/month).

```
 Dhan feed ──binary ticks──▶ LiveFeed Durable Object (api/src/live/feed.ts)
                                  │ once a second, only the symbols each viewer shows
                                  ▼
                    browsers on /api/live/stream (WebSocket)
```

- `LIVE_ACCESS` in `api/wrangler.jsonc`: `"invited"` (every signed-in user, the current setting) or
  `"owner"` (only `OWNER_EMAILS`). Showing Dhan's feed to users depends on the data arrangement with
  Dhan; switch back to `"owner"` if that ever lapses.
- Secrets: `wrangler secret put DHAN_CLIENT_ID` and `DHAN_ACCESS_TOKEN` in `api/`. Tokens last 24
  hours; the Durable Object renews them about every 20 hours. If one lapses, the owner pastes a fresh
  one under **API tokens → Dhan live feed** on the website.
- Stocks are subscribed by Dhan security id, mapped from Dhan's public instrument list by
  `npm run data:stocks` (column `stocks.dhan_security_id`).
- The feed connects when someone is watching and disconnects ten minutes after the last viewer leaves.
- Local testing: set `DHAN_FEED_URL` in `api/.dev.vars` to a stand-in server speaking Dhan's protocol.

## Security notes

- Every issued secret (API tokens, OAuth codes, access/refresh tokens, client secrets) is stored only
  as HMAC-SHA256 keyed by `TOKEN_PEPPER`; the raw value is shown once and never stored.
- Google sign-in (`api/src/lib/google.ts`) is OpenID Connect with PKCE, a `nonce`, and the in-flight
  handshake held in a sealed, HttpOnly cookie scoped to `/api/auth/google`.
- Changing `TOKEN_PEPPER` invalidates every issued token and OAuth grant.
