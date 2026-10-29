# Arthscan architecture: where every number comes from

Measured 30 Oct 2026. Latencies are from one Mac in India to production, three samples each, so
they include roughly 0.45 s of my own network to Cloudflare. Server-side figures come from the
`Server-Timing` header the site sends.

## 1. The shape of the system

```
Sources                 How we pull it                   Where it lives          How it is served
-------                 --------------                   --------------          ----------------
NSE (free)         -->  cron jobs (5 schedules)      -->                    
                   -->  on-demand pulls, kept        -->  D1 database        -->  API Worker (Hono)  -->  Web Worker (SvelteKit)  -->  Browser
Indian Stock API   -->  on-demand + 10-min fill      -->  (arthscan, Tokyo)       /v1 REST + MCP          server-rendered pages
IPO Alerts         -->  on-demand, 15-min reuse      -->  external_cache
Dhan (live feed)   -->  Durable Object WebSocket     -->  memory only        -->  /api/live (SSE)    -->  live prices
Logo.dev                (visitor's browser calls it directly, never touches our servers)
Your Mac           -->  local SQLite pipeline        -->  pushed to D1 (backfills, NSDL imports)
```

Everything runs on Cloudflare: two Workers (`arthscan-web`, `arthscan-api`), one D1 database, one
Durable Object (`LiveFeed`), five cron triggers and the Cache API. The web Worker reaches the API
Worker through a service binding, with no public hop in between.

## 2. Each source: what it is used for

| Source | Key / cost | What we use it for | How often | Stored where |
|---|---|---|---|---|
| NSE (`nseindia.com/api`, `nsearchives.nseindia.com`) | none, public | End-of-day prices (bhavcopy), delivery %, index closes, FII/DII, F&O ban and open interest, results filings and PDFs, board meetings, corporate actions, bulk/block deals, holidays, event calendar, **IPO subscription by category**, IPO details, index member lists, stock master | daily cron (18:15, 19:30, 22:00 IST, catch-up 08:30), plus on demand with stored copies | `daily_prices`, `index_daily`, `fii_dii`, `fo_*`, `financials`, `external_cache` |
| Dhan | access token (renewed every 20 h) | **Live prices only**: WebSocket feed for 3,533 instruments, the live heatmap, breadth, ticker and /live. The public scrip master CSV maps symbols to Dhan ids. Dhan has **no** financials, fundamentals or news. | live while the market is open and someone is watching | memory in the `LiveFeed` Durable Object, not stored |
| Indian Stock API (indianapi.in) | paid key | Company profile and intraday price, **financial statements**, news, mutual funds, commodities, trending lists, analyst forecasts, valuation history, per-company corporate actions and announcements, IPO list, quarterly results loader | on demand (5-min to 24-h reuse); statements stored per company, background fill every 10 min | `company_statements`, `financials`, `external_cache` |
| IPO Alerts (ipoalerts.in) | trial key, 1 week | **Grey-market premium** (hourly series), IPO logo, about, strengths, risks, prospectus link | 15-min reuse | `external_cache` |
| Logo.dev | publishable key | Company logos, looked up by ISIN | per page view, cached by their CDN | not stored |
| Google OAuth | client id and secret | Sign-in | per sign-in | `accounts` tables |
| NSDL (FPI flows) | none | Foreign portfolio flows by sector; scraped by hand in a browser and imported by command | manual | `fpi_daily`, `fpi_sector` |
| Static data | none | Macro event dates (RBI, MoSPI, Fed) written into `api/src/data/macro-events.ts` | edited by hand | in code |
| GitHub | none | **Only the code repository** (`ishaandixit22/ARTHSCAN`). No runtime data comes from GitHub. Pushing is blocked until an SSH key is added. | n/a | n/a |

Design skills installed from GitHub (taste-skill, playwright-cli and others) are development tools
only. They never run on the site.

## 3. Scheduled work (Cloudflare cron, UTC)

| Cron | IST | Job |
|---|---|---|
| `45 12 * * 1-5` | 18:15 weekdays | daily refresh: prices, deliveries, indices, FII/DII, F&O ban, open interest, splits, results, metrics |
| `0 14 * * 1-5` | 19:30 weekdays | same refresh again (files NSE publishes late) |
| `30 16 * * 1-5` | 22:00 weekdays | same refresh again |
| `0 3 * * 2-6` | 08:30 Tue-Sat | catch-up for the previous session |
| `*/10 * * * *` | every 10 min | statement store fill: up to 25 companies, 300 provider requests a day |

## 4. Latency: every pull

### External sources, one request (first byte / total, ms)

| Pull | Samples | Size |
|---|---|---|
| NSE `ipo-current-issue` | 256/256, 172/173, 84/84 | 1.8 KB |
| NSE `ipo-detail` (one issue) | 100/110, 91/91, 172/172 | 12 KB |
| NSE `holiday-master` | 114/132, 98/116, 239/258 | 34 KB |
| NSE corporate announcements, one day | 165/335, 99/212, 98/298 | 640 KB |
| NSE archives, bhavcopy zip | 168/221, 87/244, 94/153 | 206 KB |
| NSE archives, index member list | 101/101, 178/178, 85/85 | 3 KB |
| Indian Stock API `/stock` | 220/522, 192/437, 157/441 | 287 KB |
| Indian Stock API `historical_stats` (all) | 192/230, 252/307, 167/220 | 12 KB |
| Indian Stock API `/ipo` | 266/431, 249/410, 165/405 | 91 KB |
| Indian Stock API `/news` | 185/236, 238/292, 198/331 | 15 KB |
| Indian Stock API `/commodities` | 173/279, 257/381, 212/350 | 67 KB |
| IPO Alerts, one IPO | 852/853, 972/973, 693/693 | 3 KB |
| IPO Alerts, hourly premium series | 570/571, 612/613, 514/515 | 10 KB |
| Logo.dev image by ISIN | 426/426, 83/83, 60/60 | 3 KB |
| Dhan scrip master CSV | 253/869, 134/1,122, 202/1,036 | 26 MB |
| Dhan live feed | ticks within about 0.5 s of the exchange (status shows last tick) | n/a |

### Our own pages (production, three visits, ms first byte / total)

The first visit is the slowest because the API's five-minute cache is empty; later visits are
mostly network. "Server" is time spent in our Workers on the first visit.

| Page | 1st visit | 2nd | 3rd | Server on 1st |
|---|---|---|---|---|
| Home | 1,785 / 1,946 | 783 / 919 | 602 / 630 | 1,218 |
| Stock (ITC) | 1,696 / 1,837 | 679 / 858 | 524 / 662 | 1,106 |
| IPOs list | 1,725 / 1,929 | 625 / 823 | 626 / 890 | 1,258 |
| IPO page (BLS Polymers) | 2,330 / 2,527 | 487 / 633 | 626 / 886 | 1,680 |
| Sectors | 2,148 / 2,325 | 541 / 759 | 498 / 674 | 1,647 |
| Heatmap | 1,520 / 1,562 | 541 / 661 | 474 / 555 | 993 |
| FII/DII | 1,298 / 1,655 | 550 / 857 | 646 / 1,057 | 774 |
| Earnings | 1,569 / 1,934 | 593 / 925 | 524 / 874 | 1,001 |
| Breadth | 1,362 / 1,658 | 703 / 1,089 | 472 / 803 | 783 |
| Events | 1,584 / 1,744 | 472 / 666 | 576 / 784 | 1,060 |
| Filings | 1,923 / 2,484 | 540 / 1,119 | 574 / 1,113 | 1,291 |
| F&O ban | 1,458 / 1,503 | 481 / 666 | 506 / 517 | 985 |
| Deliveries | 1,013 / 1,184 | 498 / 667 | 560 / 834 | 516 |
| Valuations | 524 / 714 | 610 / 795 | 542 / 725 | 7 |
| Signals | 1,114 / 1,296 | 608 / 850 | 471 / 652 | 519 |
| Screener | 1,018 / 1,175 | 961 / 1,180 | 1,036 / 1,193 | 526 |
| News | 862 / 1,013 | 521 / 669 | 537 / 707 | 261 |
| Mutual funds | 1,007 / 1,212 | 495 / 702 | 600 / 807 | 482 |
| Live | 641 / 849 | 468 / 618 | 551 / 703 | 7 |

### Our API (internal key, total ms, three calls with the cache bypassed)

| Endpoint | ms |
|---|---|
| `/v1/market/ipo-board` | 1,840, 530, 493 |
| `/v1/market/ipo-detail` | 1,759, 449, 483 |
| `/v1/stocks/ITC` | 1,241, 501, 496 |
| `/v1/ext/stock` (provider, live) | 5,055, 899, 1,295 |
| `/v1/ext/statements` (stored) | 710, 456, 641 |
| `/v1/market/sector-matrix` | 2,037, 557, 488 |
| `/v1/market/earnings-season` | 1,550, 609, 625 |
| `/api/live/status` | 475, 503, 599 |

## 5. Where the time goes

1. **The network floor.** About 450 ms of every figure above is the trip from my Mac to
   Cloudflare. A repeat visit to the cheapest pages is mostly that.
2. **D1 round trips.** The database sits in Tokyo. Each query costs about 250 ms when the Worker is
   far away, and a page runs several one after another. This is why a cold stock page takes
   1.0 to 1.7 s of server time. The API Worker now uses smart placement to run nearer the database,
   and the statements path was cut to one query (server time fell from about 1,250 ms to about 270 ms).
3. **Provider pulls.** Indian Stock API calls cost 0.2 to 0.5 s, IPO Alerts 0.5 to 1.0 s. We avoid
   paying this per visit by storing the answers.
4. **Cold `/v1/ext/stock`.** The profile call returns 287 KB, so a cold first call can take about
   5 s. After that it is served from the five-minute copy.
5. **Edge cache.** GET requests to `/v1` with the site's own key are kept for five minutes, so a
   repeat answer costs about 5 to 10 ms of server time.

## 6. Known gaps

- Financial statements are stored for the 60 largest companies so far; the background job fills the
  rest at up to 300 provider requests a day. Raise `STATEMENTS_DAILY_MAX` once the plan's real
  limit is known.
- The IPO Alerts key is a one-week trial. If the plan stops serving premiums, the cards say so.
- The Dhan token renews itself only while the live feed is in use. If nobody opens a live page for
  more than a day, the token can lapse and need a fresh one.
- NSDL foreign-flow data is refreshed by hand.
- Nothing from this work is committed to git yet.
