# Mobile performance: before

Measured on 5 November 2026 against https://arthscan.me, running `main` at `1189980`.

## Method

- Lighthouse 12 with default simulated throttling, performance category only.
- Mobile: 3 runs per page, median shown. Throttling is 150ms RTT, about 1.6 Mbps and 4× CPU slowdown.
- Desktop: **1 run per page, so treat single differences as noise.**
- Run from one Mac in India over one connection. These are lab numbers, not user numbers.

## Mobile

| Page | Score | FCP | LCP | TBT | CLS | Speed Index | TTFB | Main thread | Total | JS | Fonts | Requests |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | 48 | 6.6s | 7.1s | 43ms | 0.243 | 6.6s | 253ms | 2,454ms | 725 KB | 137 KB | 548 KB | 67 |
| `/stock/ITC` | 61 | 5.8s | 8.5s | 40ms | 0.001 | 5.8s | 211ms | 1,791ms | 756 KB | 224 KB | 454 KB | 75 |
| `/screener` | 63 | 5.2s | 7.1s | 85ms | 0.002 | 5.2s | 160ms | 1,849ms | 518 KB | 124 KB | 356 KB | 59 |
| `/ipos` | 66 | 4.7s | 6.2s | 22ms | 0.002 | 4.7s | 482ms | 1,331ms | 537 KB | 131 KB | 356 KB | 63 |
| `/mutual-funds` | 68 | 4.4s | 5.7s | 79ms | 0.000 | 4.4s | 531ms | 1,356ms | 434 KB | 122 KB | 271 KB | 57 |
| `/news` | 67 | 4.5s | 6.2s | 20ms | 0.002 | 4.5s | 340ms | 1,463ms | 6,491 KB | 121 KB | 454 KB | 78 |
| `/calculators/sip` | 67 | 4.5s | 5.8s | 89ms | 0.002 | 4.5s | 213ms | 1,277ms | 530 KB | 145 KB | 356 KB | 61 |
| `/fii-dii` | 65 | 4.5s | 6.2s | 124ms | 0.001 | 4.5s | 401ms | 1,602ms | 536 KB | 128 KB | 356 KB | 59 |

## Desktop (single run)

| Page | Score | FCP | LCP | TBT | CLS |
| --- | --- | --- | --- | --- | --- |
| `/` | 39 | 3.2s | 3.8s | 0ms | 0.652 |
| `/stock/ITC` | 60 | 3.6s | 4.3s | 0ms | 0.046 |
| `/screener` | 67 | 2.5s | 3.3s | 0ms | 0.046 |
| `/ipos` | 64 | 3.0s | 3.6s | 0ms | 0.046 |
| `/mutual-funds` | 62 | 3.1s | 4.0s | 0ms | 0.046 |
| `/news` | 68 | 2.6s | 3.0s | 0ms | 0.046 |
| `/calculators/sip` | 60 | 3.6s | 4.2s | 0ms | 0.046 |
| `/fii-dii` | 67 | 2.6s | 3.4s | 0ms | 0.000 |

## What was costing the most

| Item | Size or time |
| --- | --- |
| News thumbnails on phones | 5,886 KB |
| Fonts: serif latin 120, serif ext 99, Archivo 89, Archivo ext 84, Tiro 63, italic 50 and 43 | up to 548 KB |
| 3D city on the phone home page | 1,776ms long task |
| Stock index on search focus | 410 KB raw, 153 KB gzip |
| Clarity | 25 KB, 94–112ms long task |

Requests: about 7 fired on first touch of a stock page (5 statements, fundamentals, filings). Duplicate API requests weren't profiled, so whether any occur is unknown.

## Bundles (`main` build)

| | Files | Raw | Gzip |
| --- | --- | --- | --- |
| All JavaScript | 89 | 893 KB | 316 KB |
| All CSS | | 147 KB | 38 KB |

These totals cover every route; no visitor downloads them all. Largest files:

| File | Raw | Gzip |
| --- | --- | --- |
| klinecharts chunk, dynamic | 243 KB | 63 KB |
| Stock page | 100 KB | 34 KB |
| Node 7 | 60 KB | 21 KB |
| Node 22 | 51 KB | 15 KB |
| Home page, including the city | 33 KB | 13 KB |
| Layout | 21 KB | 8 KB |

## Unavailable

- **Field LCP, INP and CLS (p75):** unavailable. No CrUX or RUM data was read, because the Cloudflare and Clarity dashboards weren't reachable from this session.
- **INP in the lab:** unavailable. Lighthouse navigation runs don't measure it.
- **Re-render profile and memory use:** not measured.
