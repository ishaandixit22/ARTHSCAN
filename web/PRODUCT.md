# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Beginners first: Indian retail investors who are new to the market — students and young earners with a fresh demat account who do not yet know what P/E, FII flows or delivery % mean. Behind them, learning DIY investors who already buy on tips and want to research properly. The product is built so a beginner understands it on day one and still has depth to grow into.

Secondary audience for the showcase: investors and incubators evaluating ARTHSCAN as a startup. The site has to read as a credible, fundable financial product.

## Product Purpose
ARTHSCAN is a stock research platform for NSE-listed Indian equities: market overview, a screener, per-stock pages (price, fundamentals, statements, shareholding, filings, technicals, peers), sectors and rotation, heatmap, breadth, FII/DII flows, F&O ban list, deliveries, earnings season, IPOs with live subscription and grey-market premium, events, news and mutual funds. Success is a beginner choosing ARTHSCAN over Screener.in, Tickertape or similar because it explains the market while showing it.

## Positioning
Explains while it shows: every number carries a plain-English reading for a beginner. Live prices and intraday charts from Dhan, end-of-day NSE data, and an interactive 3D city of the Nifty 100 on the home page as the signature view of the market.

## Operating Context
Used on phones and laptops, often during or right after market hours (09:15–15:30 IST). Data refreshes from NSE after close; live prices stream from Dhan while the market is open. Sign-in is Google OAuth; there is a public API and an MCP server for developers.

## Capabilities and Constraints
- SvelteKit 2 (Svelte 5 runes) on Cloudflare Workers; API Worker (Hono) and D1 database behind it.
- CSP allows Google Fonts for stylesheets/fonts and no other external hosts for scripts; charts use lightweight-charts; the 3D city is raw WebGL2.
- Live data (Dhan) is shown under the LIVE_ACCESS setting and may be withdrawn.
- Not a SEBI-registered adviser: copy describes data and never recommends buying or selling.

## Brand Commitments
- Name: ARTHSCAN ("Arthscan" in running text).
- The interactive 3D Nifty 100 city stays as the home page's signature view (user confirmed they like the 3D idea).
- No "AI slop" look: the user explicitly rejected generic fonts and boxy, everything-in-a-card layouts. Tone is serious, befitting a financial business, while being creative.

## Evidence on Hand
Real market data across the whole site (NSE, Dhan, Indian Stock API, IPO Alerts). No customers, user counts, testimonials, press or funding claims exist; none may be invented.

## Product Principles
1. Explain while showing: a number without a plain reading is unfinished.
2. Truth over hype: real data, sourced and dated; no advice, no invented claims.
3. Beginner-first, never dumbed down: depth is one step away, not removed.
4. Serious money, human voice: credible enough for an investor pitch, warm enough for a first-time investor.
