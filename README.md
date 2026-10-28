# Arthlens — Indian stock research platform

Phase 1 of the build plan: an NSE research website, a REST API and an MCP server,
all reading one shared data layer. "Arthlens" is a working name — change it in
`web/src/lib/brand.ts` and `api/src/mcp/server.ts` once the real name clears the
domain and trademark checks.

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

## Moving to Cloudflare later

The code is written for it; nothing needs rewriting:

- `api/src/app.ts` is a plain Hono app. A Worker entry is `export default { fetch: app.fetch }` with
  a D1 binding named `DB` — the `Database` interface in `api/src/db/types.ts` is D1's own API.
- `api/migrations/*.sql` are plain SQLite and apply with `wrangler d1 migrations apply`.
- All crypto uses Web Crypto; no Node APIs outside `api/src/server.ts` and `api/src/db/sqlite.ts`.
- `web/` switches from `@sveltejs/adapter-node` to `@sveltejs/adapter-cloudflare` in `svelte.config.js`.
- The pipeline is a batch job (the plan puts it on Heroku); point it at D1 via the HTTP API or
  export/import, or run it as a Worker Cron Trigger once rewritten to stream into D1.

`vendor/` holds the four reference repositories (MIT / CC BY 4.0). agentdraft's Worker supplied
the Google sign-in and token-hashing approach; the Tapetide MCP bridge supplied the protocol-version
negotiation and anonymous "discovery mode"; the tapetide-score methodology is the spec for the
Phase 3 score.
