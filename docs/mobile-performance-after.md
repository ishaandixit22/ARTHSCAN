# Mobile performance: after

**Page weight and main-thread work fell sharply, and the home page's layout shift is gone. Simulated mobile LCP still misses the 2.5s target on every page measured, and field numbers are unavailable, so Core Web Vitals haven't been shown to pass.**

Same method as `mobile-performance-before.md`. Live results are from https://arthscan.me on 5 November 2026, version `b7c40a08`, about 40 minutes after the baseline.

## Live site, mobile (median of 3)

| Page | Score | FCP | LCP | TBT | CLS | Main thread | Total | JS | Fonts |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | 48 → **62** | 6.6 → 6.0s | 7.1 → 6.6s | 43 → 0ms | 0.243 → **0.001** | 2,454 → 678ms | 725 → 355 KB | 137 → 120 KB | 548 → 191 KB |
| `/stock/ITC` | 61 → 60 | 5.8 → 6.6s | 8.5 → 7.2s | 40 → 6ms | 0.001 → 0.026 | 1,791 → 683ms | 756 → 367 KB | 224 → 148 KB | 454 → 141 KB |
| `/screener` | 63 → 66 | 5.2 → 5.3s | 7.1 → 5.7s | 85 → 0ms | 0.002 → 0.001 | 1,849 → 583ms | 518 → 294 KB | 124 → 111 KB | 356 → 141 KB |
| `/ipos` | 66 → **52** | 4.7 → 5.1s | 6.2 → 5.4s | 22 → 14ms | 0.002 → **0.300** | 1,331 → 607ms | 537 → 313 KB | 131 → 118 KB | 356 → 141 KB |
| `/mutual-funds` | 68 → 70 | 4.4 → 4.4s | 5.7 → 5.2s | 79 → 0ms | 0.000 → 0.001 | 1,356 → 588ms | 434 → 294 KB | 122 → 108 KB | 271 → 141 KB |
| `/news` | 67 → 72 | 4.5 → 4.4s | 6.2 → 4.8s | 20 → 0ms | 0.002 → 0.002 | 1,463 → 686ms | 6,491 → **284 KB** | 121 → 107 KB | 454 → 141 KB |
| `/calculators/sip` | 67 → 68 | 4.5 → 4.9s | 5.8 → 5.3s | 89 → 34ms | 0.002 → 0.000 | 1,277 → 446ms | 530 → 307 KB | 145 → 132 KB | 356 → 141 KB |
| `/fii-dii` | 65 → 68 | 4.5 → 4.7s | 6.2 → 5.4s | 124 → 18ms | 0.001 → 0.050 | 1,602 → 497ms | 536 → 312 KB | 128 → 115 KB | 356 → 141 KB |

TTFB moved between 151ms and 640ms across these runs, depending on edge cache state, which accounts for some of the FCP differences in either direction.

## Two regressions in that deploy, fixed but not yet live

The deployed version had two layout-shift problems this measurement exposed:

| Page | Cause | Fix | Local result, median of 3 |
| --- | --- | --- | --- |
| `/ipos` (0.300) | Removing the serif font preload on phones made text reflow when the font arrived | Preload restored | 0.000 |
| `/fii-dii` (0.050) | Charts rendered wider than the page until they measured it | `main svg { max-width: 100% }` on compact screens | 0.000 |

These fixes need another deploy. `/stock/ITC` stays at 0.026 locally; the shift is the strengths and weaknesses block filling in.

## Same machine, no network: `main` against the fixed branch

Both are production builds run locally on the same API and data. This removes network and edge cache differences, so it's the cleanest comparison of the code alone. It still isn't what users experience.

| Page | Score | FCP | LCP | TBT | CLS | Main thread | Total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Mobile `/` | 58 → **83** | 4.6 → 2.9s | 5.6 → 3.9s | 22 → 0ms | 0.205 → 0.000 | 1,289 → 346ms | 669 → 326 KB |
| Mobile `/stock/ITC` | 70 → **83** | 4.0 → 2.9s | 5.6 → 3.9s | 48 → 0ms | 0.000 → 0.026 | 995 → 294ms | 664 → 304 KB |
| Mobile `/ipos` | 77 → **87** | 3.2 → 2.4s | 4.4 → 3.6s | 0 → 0ms | 0.000 → 0.000 | 1,055 → 286ms | 483 → 286 KB |
| Mobile `/fii-dii` | 77 → **88** | 3.2 → 2.4s | 4.5 → 3.5s | 0 → 4ms | 0.000 → 0.000 | 1,378 → 401ms | 482 → 285 KB |
| Desktop `/` | 96 → 99 | 1.0 → 0.8s | 1.2 → 0.9s | 0 → 0ms | 0.001 → 0.001 | 406 → 412ms | 669 → 387 KB |
| Desktop `/stock/ITC` | 96 → 98 | 1.0 → 0.8s | 1.2 → 1.0s | 0 → 0ms | 0.000 → 0.000 | 145 → 192ms | 714 → 473 KB |

## Live site, desktop (single runs: treat as noisy)

| Page | Score | LCP | TBT | CLS |
| --- | --- | --- | --- | --- |
| `/` | 39 → 47 | 3.8 → 4.1s | 0 → 302ms | 0.652 → **0.001** |
| `/stock/ITC` | 60 → 57 | 4.3 → 5.6s | 0 → 0ms | 0.046 → 0.000 |
| `/ipos` | 64 → 59 | 3.6 → 4.5s | 0 → 0ms | 0.046 → 0.000 |
| `/news` | 68 → 58 | 3.0 → 5.1s | 0 → 0ms | 0.046 → 0.000 |
| `/screener` | 67 → 66 | 3.3 → 3.5s | 0 → 0ms | 0.046 → 0.000 |
| `/mutual-funds` | 62 → 67 | 4.0 → 3.3s | 0 → 0ms | 0.046 → 0.000 |
| `/calculators/sip` | 60 → 66 | 4.2 → 3.4s | 0 → 0ms | 0.046 → 0.046 |
| `/fii-dii` | 67 → 65 | 3.4 → 3.4s | 0 → 0ms | 0.000 → 0.000 |

Several desktop pages look slower here. The local comparison above, at 3 runs each, doesn't reproduce a slowdown on `/` or `/stock/ITC`, and `/news` was also carrying 7.8 MB of images against 5.9 MB because the headlines had changed. Still, this needs re-measuring on the live site with more runs after the next deploy. It hasn't been ruled out.

## Bundles

| | `main` | Branch |
| --- | --- | --- |
| All JavaScript, gzip | 316 KB in 89 files | 331 KB in 96 files |
| All CSS, gzip | 38 KB | 44 KB |
| klinecharts | 63 KB gzip | Unchanged, now loaded near the chart |

The site's total grew by 15 KB gzip of JavaScript, mostly the drawer, the search panel, 2D tiles and lazy loading. What a page actually downloads went down, as the JS column above shows. CSS on each page rose by 4–6 KB, which is a real cost.

## Targets

| Target | Result |
| --- | --- |
| LCP ≤ 2.5s at p75 | **Not shown.** Simulated LCP is 4.8–7.2s live and 3.5–3.9s locally. Without throttling, LCP was 0.8–0.9s on the pages checked, but that says little about real phones. Field p75 is unavailable |
| INP ≤ 200ms at p75 | **Unavailable.** TBT and main-thread work fell, which points the right way but doesn't measure INP |
| CLS ≤ 0.1 at p75 | **Lab only.** Under 0.1 on all eight pages once the `/ipos` fix is deployed; 0.300 on `/ipos` until then. Field p75 is unavailable |
| Repeatable before and after Lighthouse | Done, method above |
| Header without waiting for an API | **Partly.** The header needs no data of its own and no client request, but it arrives in the HTML, which is rendered on the server after the API answers. On an edge cache hit that's quick; on a miss it isn't |
| No horizontal body scroll | Met: 374 browser tests pass on the live site and on the fixed build, at 320–1440 wide including landscape |
| No desktop breakage | No breakage found in screenshot comparison at 1024, 1280 and 1440, with the speed caveat above |
| No significant initial JS increase | Met: per-page JS is lower on all eight pages |

## Page length at 390px

Cards are easier to read than sideways tables, but they're taller, and this wasn't uniformly an improvement.

| Page | Before | After |
| --- | --- | --- |
| `/filings` | 62,797px | about 10,500px |
| `/mutual-funds` | 7,341px | about 18,000px |
| `/deals` | 8,831px | shorter than the 26,517px measured before the 40-row cap; not re-measured |
| `/breadth` | 12,405px | shorter than the 24,026px measured before the cap; not re-measured |

`/mutual-funds` is the clearest cost: it's more than twice as long as it was.

## Remaining bottlenecks, largest first

1. **Field data is missing.** Without it, nobody can say whether real users are inside the targets. Check Cloudflare Web Analytics first.
2. **Many small files.** Phone pages make 58–74 requests, because SvelteKit preloads about 50 small chunks. Lighthouse's simulation charges heavily for this: 4.4s simulated first paint against 0.9s observed unthrottled on `/news`. Testing on a real mid-range Android phone or WebPageTest would show how much is real before any change to chunking.
3. **Server rendering waits on the API on an edge cache miss.** TTFB reached 640ms in these runs.
4. **Fonts are still the largest single cost,** at 141–191 KB on phones. Dropping the italic, or using fewer serif weights, is a design decision.
5. **Long lists are still all in the HTML.** Capped rows are hidden, not absent. Server-side paging would lower document size on `/breadth`, `/deals` and `/signals`.
6. **`/mutual-funds` is long on phones.** Collapsing categories would help.
7. **Stock page JS is the largest route file** at 34 KB gzip. Splitting off its lower sections would help, but it's a larger change.

## Unavailable

Field LCP, INP and CLS; lab INP; a re-render profile; real-device testing; Safari on iOS. All browser testing here was Chromium emulating phones, so safe-area insets and iOS `<dialog>` behaviour **haven't been checked on a real iPhone**.

## Reproducing

```bash
cd web
BASE_URL=https://arthscan.me npm run test:mobile
npx lighthouse https://arthscan.me/ --only-categories=performance --output=json --output-path=home.json
```

Screenshots are in `docs/mobile-screenshots/`: `<page>-before.jpg` and `<page>-after.jpg` at 390px. The after shots are from version `b7c40a08`; the before shots are the `main` build run locally.
