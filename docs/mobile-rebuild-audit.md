# Mobile rebuild: audit

Audited 5 November 2026 from `main` at commit `1189980`. All work is on the branch `mobile-rebuild`.

## Stack as found

| Area | What the repository uses |
| --- | --- |
| Web app | SvelteKit 2 with Svelte 5 runes, TypeScript, built with Vite |
| Hosting | Cloudflare Workers (`adapter-cloudflare`), HTML cached at the edge by `cachedPage` |
| API | Hono Worker on D1, reached through a service binding |
| Styling | One hand-written `app.css` plus scoped component styles. No Tailwind, no component library |
| Charts | `klinecharts` 10 on the stock page, `lightweight-charts` 4 for smaller price charts, hand-written SVG elsewhere, raw WebGL2 for the 3D city |
| Icons | `NavIcon.svelte`, a small inline SVG set |
| Security | Hash-mode CSP. No inline scripts; scripts only from self, Cloudflare Insights and Clarity |
| Design | "Market edition" newspaper identity from `PRODUCT.md`: paper and ink, heavy rules, no boxes, Archivo, Source Serif 4, Tiro Devanagari |

No framework migration or backend schema change was needed, and none was made.

## Route map

| Group in the phone menu | Routes |
| --- | --- |
| Markets | `/`, `/live` (with live access), `/stocks`, `/heatmap`, `/sectors`, `/signals`, `/breadth`, `/valuations`, `/deliveries`, `/fo-ban`, `/fii-dii`, `/deals`, `/commodities` |
| Discover | `/screener`, `/screener?tab=technical`, `/screener/custom`, plus 180 screens at `/screener/[slug]` |
| Research | stock search, `/earnings`, `/filings`, `/corporate-actions`, `/board-meetings`, `/events`, plus `/stock/[symbol]` and `/sectors/[sector]` |
| Investments | `/ipos` and its five stage tabs, `/ipos/[symbol]`, `/mutual-funds`, `/mutual-funds/fund` |
| News | `/news` |
| Tools & Data | `/calculators` and every calculator, `/developers`, `/developers#connect`, `/developers#tools`, `/settings/tokens` |
| Platform | `/about`, `/pricing`, `/contact`, `/terms`, `/privacy`, `/sitemap.xml`, `/login` |

`/breadth` was on no menu at all before this work. It's now in the drawer. The desktop menus were left as they were.

## Findings

### Navigation

- Below 860px the desktop masthead was stacked rather than redesigned: ticker, then logo, then search and tools, then one "Markets" button. Page content began 210px down on every page at 390px wide. It now begins at 52px.
- Most destinations were behind that single Markets panel. There was no way to search for a page, and no route-aware highlight beyond the panel's own.
- `Search.svelte` fetched the whole stock index (410 KB raw, 153 KB gzip) when the search box took focus, on phones as well.

### Loading

- Fonts were the biggest cost on every page: 271–548 KB against 121–224 KB of JavaScript. The `₹` glyph lived in the latin-extended files, so any page showing a price pulled those too.
- The home page ran the 3D city on load. It produced a 1,776 ms long task on Lighthouse's simulated mobile CPU.
- `/news` loaded 5.9 MB of thumbnails on a phone.
- The first touch of a stock page set off about seven requests (five statements, fundamentals, filings), though most readers never reach those sections.
- `klinecharts` (243 KB raw, 64 KB gzip) was already a dynamic import, but it loaded as soon as the stock page did.
- Clarity's 25 KB loaded during page start.

### Layout

- Home page scroll width was 737px on a 320px screen, hidden from view by `overflow-x: clip` on the body. So content was being cut off, with no scrollbar to warn of it. `/developers` tables were clipped the same way (428 elements at 390px).
- Between 861px and about 1100px, the stock page's section tabs ran off the page and "Peers" couldn't be reached. This also affected `main` at 1024px wide.
- `/filings` was 62,797px tall at 390px and `/board-meetings` 25,438px.
- Wide tables scrolled sideways with every figure off screen, because long first columns filled the viewport.

### Not measured

Field data for LCP, INP and CLS is **unavailable**. The Cloudflare Web Analytics and Clarity dashboards weren't reachable from this session. The site has had no CrUX or RUM report reviewed as part of this work. See `mobile-performance-before.md`.

## Library decisions

| Library | Decision | Why |
| --- | --- | --- |
| shadcn/ui, shadcn-admin | Not adopted | React components. The site is Svelte, and the admin-dashboard look conflicts with `PRODUCT.md` |
| Tailwind CSS | Not adopted | Would mean restyling every page and migrating away from a working token system, for no user-visible gain |
| Lucide | Not adopted | `NavIcon` plus about 20 more hand-picked paths covers it for far less than a new dependency |
| TanStack Query | Not adopted | No client-side data cache layer is needed: pages render on the server and sit behind the edge cache. The few client fetches now use `AbortController` and load on approach |
| TanStack Table | Not adopted | Existing tables work, and the phone problem was layout, which CSS solves |
| TanStack Virtual | Not adopted | Rows in phone cards use `content-visibility`, and lists stop at 40 rows until asked. Both are server-rendered and keep browser find working. Virtualising would add JavaScript to pages whose cost is layout |
| lightweight-charts, klinecharts | Kept | Replacing them isn't justified by the evidence: load is now deferred, and disposal was already handled. Sizes in the performance report |
| Playwright | Adopted, dev only | `@playwright/test` runs the mobile test suite |
| Lighthouse | Run through `npx`, not added | Measurement tool, no need for it in `package.json` |
| web-vitals | Not added yet | Cloudflare Web Analytics is already on the site and reports Core Web Vitals. Check that dashboard first; add `web-vitals` only if it falls short |

## Decisions the brief left open

- **Markets tab** goes to `/heatmap`, the clearest single market view. The rest of the group is in the drawer.
- **Ticker** is hidden on phones and opens no socket there. The home page's index strip takes its place.
- **Sensex** isn't shown. The data on the site is NSE only, and inventing or scraping a BSE figure wasn't appropriate. Adding it means adding a data source.
- **3D city** stays the desktop's signature. Phones get 2D sector tiles from the same data, plus an "Open the 3D city" button. `PRODUCT.md` keeps the city, so it was made optional rather than removed.
- **Stock page tabs**: the existing section rail is kept as a sticky scrolling rail instead of building real tabs. All sections stay in the page, so search engines and browser find still reach them, and off-screen sections skip rendering.
- **Cards versus tables**: listings became cards on phones. Statements, histories and heatmaps stay tables with a pinned first column, because comparing across columns is the point of them.
