# Mobile rebuild: changelog

Branch `mobile-rebuild`, from `main` at `1189980`. Deployed as version `b7c40a08` on 5 November 2026. Two later fixes aren't live yet: the serif font preload on phones and the chart width cap. See `mobile-performance-after.md`.

Phones are 640px and below; "compact" means 860px and below. Above 860px, pages look as they did on `main`, apart from the fixes listed under Desktop.

## Navigation

- **Phone header** (`routes/+layout.svelte`): menu, logo, search and account in one sticky bar that needs no data. It respects safe areas. Page content now starts at 52px instead of 210px.
- **Drawer** (`SiteDrawer.svelte`, `Sheet.svelte`): every destination, built from the same lists as the desktop menus (`lib/nav.ts`), in Markets, Discover, Research, Investments, News, Tools & Data and Platform. It has expandable sections, an active-page bar, a menu search, its own scrolling, focus trap, Escape, focus return and page scroll lock, on the browser's native `<dialog>`.
- **Separate searches**: the menu search finds pages; `SiteSearch.svelte` finds stocks through the server, debounced at 220ms and cancelled when superseded. Phones never fetch the 410 KB stock index.
- **Bottom bar** (`BottomNav.svelte`): Home, Markets, Screener, IPOs, More. It hides in landscape at 480px tall or less, to give the height back.
- **Early taps** (`static/theme.js`): a tap before the app has started is remembered and honoured.
- **Desktop nav** is unchanged, and the drawer and search panels aren't downloaded there.

## Mobile design tokens

`app.css` gains spacing (`--space-1` to `--space-6`), type (`--text-micro`, `--text-small`, `--text-body`, `--text-read`), touch (`--tap` 44px, `--row` 48px) and chrome (`--chrome-top`, `--chrome-bottom`) tokens. Reusable patterns:

- `table.m-cards` with `data-label` turns a table into cards
- `.m-quote` puts name, price and change on one line
- `.m-capped` with `phoneCap` stops long lists at 40 rows
- `.m-defer` skips off-screen rendering

## Pages

- **Home**: briefing first, then search and movers. 2D sector tiles from the same data as the city, with the 3D city one tap away. Its overflow at 320px is gone.
- **Screener**: filters in a bottom sheet with Reset and Apply; a sticky bar with filter count and sort; cards for results. The desktop table is unchanged.
- **Stock**: name and price, then a key-figures line, then the sticky section rail. About text is clamped with Read more. The chart library and candles wait until the chart is near, as do statements and filings. Chart drawing tools sit behind a Draw button so the chart isn't a touch trap.
- **IPOs**: issue cards were already good and are kept. Recently listed is now cards. The repeated directory list is hidden on phones because the tabs reach every issue.
- **Funds, deals, deliveries, signals, corporate actions, board meetings, commodities, pricing, API docs**: cards on phones.
- **F&O ban, valuations, FII/DII**: fit the screen or scroll with a pinned first column.
- **Heatmap, breadth, events, earnings**: tab bars fixed, and they scroll instead of wrapping.
- **News**: no thumbnails on phones.
- **Filings**: 60 per page with Show more.
- **Long lists**: 40 rows, then "Show all".

## Performance

- Fonts re-subset with the rupee sign in the latin file (Archivo 61 KB, serif 83 KB, italic 50 KB).
- 3D city split out of the home page bundle. Phones load it on request only.
- Clarity waits until 2.5 seconds after load, then idle. The Cloudflare beacon is unchanged.
- `/search.json` responses are cacheable for 60 seconds; live market polling pauses in hidden tabs.
- Ticker opens no socket on compact screens.

## Desktop

These are bug fixes that also reach desktop:

- Stock page section tabs scroll below 1180px instead of being cut off at about 1024px.
- `/developers` argument tables scroll inside themselves instead of being clipped.
- Font files changed, so some text sits a pixel differently.
- The home search placeholder is shorter.

## New dependency

| Package | Where | Why |
| --- | --- | --- |
| `@playwright/test` 1.58.2 | `web` devDependency | Mobile browser tests. Not shipped to users |

No runtime dependency was added.

## Tests

`web/test/mobile/nav.spec.ts` and `pages.spec.ts`, run with `BASE_URL=<site> npm run test:mobile`. They cover:

- every desktop and footer destination being in the drawer
- drawer behaviour at 320, 360, 390 and 430
- no sideways scroll across 34 routes at 320, 360, 375, 390, 430, 768, 844 (landscape), 1024, 1280 and 1440
- lazy loading, search behaviour and the filter sheet
- the desktop nav being intact

## Files

New:

- `web/playwright.config.ts`
- `web/src/lib/components/{BottomNav,CityTiles,Sheet,SiteDrawer,SiteSearch}.svelte`
- `web/src/lib/{near,phoneCap}.ts`, `web/src/lib/viewport.svelte.ts`
- `web/static/fonts/{archivo-latin-2,source-serif-latin-2,source-serif-italic-latin-2}.woff2`
- `web/test/mobile/*`, `web/test/preview.wrangler.jsonc`
- `docs/mobile-*.md`, `docs/mobile-screenshots/*`

Changed:

- `.gitignore`, `package-lock.json`, `web/package.json`, `web/svelte.config.js`
- `web/src/app.css`, `web/src/app.html`, `web/static/analytics.js`, `web/static/theme.js`
- `web/src/lib/nav.ts`, `web/src/lib/liveMarket.svelte.ts`
- Components: `CalculatorView`, `FilingList`, `MarketsMenu`, `NavDropdown`, `ProChart`, `Search`, `SiteFooter`, `StockNews`, `StockTable`, `TickerTape`
- Routes: `+layout`, `+page`, `board-meetings`, `breadth`, `commodities`, `corporate-actions`, `deals`, `deliveries`, `developers`, `earnings`, `events`, `fii-dii`, `filings`, `fo-ban`, `heatmap`, `ipos`, `ipos/[symbol]`, `mutual-funds`, `news`, `pricing`, `screener/[slug]`, `screener/custom`, `search.json`, `signals`, `stock/[symbol]`, `valuations`

`web/svelte.config.js` gains a `PREVIEW_NO_BINDINGS` switch, used only to run a local preview without the Cloudflare service binding. Production builds are unaffected.

## Left in place

The old font files (`archivo-latin.woff2`, `source-serif-latin.woff2`, `source-serif-italic-latin.woff2`) stay in `static/fonts`, because pages cached at the edge still reference them after a deploy. They can go once that cache has turned over.
