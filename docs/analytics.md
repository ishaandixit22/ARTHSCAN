# Analytics: funnel, active users and the daily dashboard

## Active user (locked definition)
An account is **active** on a day if it is signed in, not internal, and on that day did at least one of:
- **Site query**: viewed an analysis page while signed in: screener, FII/DII, market breadth, F&O ban (options), heatmap,
  signals, sectors, valuations, indices, or a stock page. Listed in `QUERY_PAGES` in `web/src/hooks.server.ts`.
  A portfolio-analyser page is not built yet; add it to that list when it ships.
- **MCP query**: one successful call (`usage_log.surface = 'mcp'`, `ok = 1`) through the Arth MCP server with the account's token or OAuth sign-in.

**WAU** = distinct active accounts in the last 7 days. **MAU** = distinct active accounts in the last 30 days (rolling, IST days).
**Activation** = share of a day's signups that have made at least one query since.

Exclusions:
- Anonymous MCP or REST calls: the server answers 401 without an identity, and nothing is logged, so they are never counted.
- Internal accounts: emails in `OWNER_EMAILS` or `INTERNAL_EMAILS` (comma-separated, set on the API) are removed from every figure.
- Bots: the visit beacon needs JavaScript and the API ignores bot user agents. Signup needs a Google sign-in.
- Plain REST calls with an API token are shown separately (`api_token_users_30d`) and do not make an account active.
- Failed calls (`ok = 0`) and signed-out page views do not count.

## What is tracked
| Step | Where | Stored |
|---|---|---|
| Visit | `web/static/analytics.js` beacon, once per browser session, to `POST /api/analytics/visit` | `events` row: channel, source, UTM, landing path. No visitor id, IP or user agent. Sets a 30-day first-touch cookie `al_src` |
| Signup | `account.ts` sign-in (Google, dev) | `events` row with the account id and the channel from `al_src` |
| Site query | `hooks.server.ts` after a signed-in page view, `POST /api/analytics/query` (internal key) | `events` row, one per account, page group and day |
| MCP query | `handlers/call.ts` (already existed) | `usage_log` |

Channel (`lib/analytics.ts`): from `utm_source`/`utm_medium`, else the referrer host: `email`, `paid`, `social`, `search`, `ai`, `referral`, `direct`, or the UTM source name. Accounts created before 2026-11-11 show as `unknown`.
Tag links as `?utm_source=<where>&utm_medium=<social|email|paid|...>&utm_campaign=<name>`.
Cloudflare Web Analytics and Clarity stay in place for unique visitors and session replays; our own `visits` counts browser sessions.

## Reading the dashboard
Owner only, signed in: **https://arthscan.me/analytics** (`?days=7..90`). Cards show today's visits, signups, WAU, MAU and MCP users;
the channel table covers the window; the daily table has visits, signups, activated, activation %, WAU, MAU, MCP MAU.
The same data is JSON at `GET /api/analytics/funnel?days=30`.

## Onboarding friction
Nothing changed in the flow; the website's login already returns people to the page they came from. Found, not fixed: the invite-only gate sends signed-out visitors straight to login; Google is the only sign-in method; no first-run
prompt or example query after signup; the MCP setup needs a token and is not linked from the signup flow.
