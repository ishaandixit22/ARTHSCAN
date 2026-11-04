# Arthscan backlink kit

Everything needed to list Arthscan on directories. Work through [tracker.csv](tracker.csv) from the top.

The tracker holds every directory found in Tapetide's footer on 5 November 2026 (188 sites), plus 13 important ones Tapetide doesn't show, such as the MCP registries. Each site's front page was fetched once to see if it is live and to find its submission page. That page link was detected automatically, so some are wrong or blank. Domain ratings weren't measured.

| Priority | Meaning |
|---|---|
| A | Do first: real audience or a directory people actually use |
| B | Worth an afternoon |
| C | Long tail: low value each, do only after A and B, and only if free |
| Skip | Down, or openly sells links or launch votes |

## Before you submit

These gaps will get listings rejected, or waste the visits they bring:

- [ ] **About, Contact, Terms and Pricing pages.** Built, and live once deployed. The site shows `support@arthscan.me` (`CONTACT_EMAIL` in `web/src/lib/brand.ts`), so set up that forward and test it first. Have a lawyer read the Terms.
- [ ] **Screenshots.** 5 to 8 real ones at 1920×1080: home, stock page, screener, a calculator, IPOs, and Claude using the MCP server.
- [ ] **A support email and social accounts.** Add accounts to `SOCIALS` in `web/src/lib/footer.ts`, and they appear in the footer.
- [ ] **Legal check on data.** Dhan's terms bar showing its material publicly without written consent, and that answer is still outstanding. A listing drive puts the site in front of more people, so get the answer first.
- [ ] **A new sender address.** Register directories under a dedicated address such as `hello@arthscan.me`, because many send marketing mail afterwards.

## Rules for each submission

1. Open the site in a browser and check it looks real. Skip it if the submission form asks for payment to be listed at all.
2. Use the copy marked in the tracker, and change the first sentence each time. Identical text everywhere adds nothing.
3. Link to the most relevant page, not always the home page: calculators to `/calculators`, the MCP server to `/developers`.
4. Fill in the tracker the same day: date, listing URL and status.
5. Once it is live, open the listing's HTML, find the link to arthscan.me and record its `rel` value. `nofollow`, `sponsored` or `ugc` means the link passes little ranking value. Then add verified listings to `LISTINGS` in `web/src/lib/footer.ts`.

## A warning about badges

Tapetide's footer carries about 180 directory badges. Most of those sites list you free only in exchange for a badge link back. Google's spam policies name excessive link exchanges as a link scheme, so a site-wide wall of them can get those links ignored or, at worst, count against the site.

- Don't copy the badge wall. Keep the footer to about eight badges from directories you would be happy to be seen on.
- If a site requires a badge and isn't in that eight, put the badge on one page, or skip the site.
- Directories give you a base, not rankings. Links earned because a page is useful last longer, and the calculators are a good thing to pitch: personal finance writers link to tools like the income tax comparison.

## Listing copy

**Basics**

| Field | Value |
|---|---|
| Name | Arthscan |
| URL | https://arthscan.me |
| Category | Finance, investing, stock research, developer tools |
| Pricing | Free to browse. API and MCP: free plan with 50 calls a day |
| Logo | https://arthscan.me/icon-512.png and https://arthscan.me/favicon.svg |
| Tags | Indian stock market, NSE, stock screener, mutual funds, IPO, FII DII data, financial calculators, MCP server, stock API |
| Tagline (under 10 words) | Indian stock research on the web and in your AI |
| Short (60 characters) | NSE stock research, screeners and calculators, free to use |

### Copy A: launch and startup directories

> Arthscan makes it easy to research any Indian stock in one place. Look up an NSE-listed company's prices, financials, filings and ownership, then filter the market with the screener. Follow FII and DII flows, bulk deals, earnings dates, IPOs and F&O bans without opening five different sites.
>
> It also includes mutual fund data and 20 free financial calculators for SIPs, loans, tax and retirement. Developers and AI users can reach the same data over a REST API and an MCP server, so Claude and other assistants can answer questions from it directly.
>
> You can browse it free, without signing up.

### Copy B: software and alternative directories

> Arthscan is a free alternative to Screener.in and Tickertape for researching Indian stocks, with a REST API and MCP server included.
>
> - Stock pages with prices, financials, filings and ownership
> - A screener across price, returns and fundamentals
> - Market pages for FII and DII flows, deals, deliveries, sectors, F&O bans and commodities
> - Calendars for earnings, corporate actions, board meetings and IPOs
> - Mutual fund data and 20 financial calculators
> - API and MCP access on a free plan of 50 calls a day

### Copy C: profiles (Crunchbase, LinkedIn, India directories)

> Arthscan is an Indian stock market research platform. It covers NSE-listed companies, mutual funds and IPOs, with market data, a screener and financial calculators for individual investors. Its API and MCP server make the same data available to developers and AI assistants. Arthscan is not a SEBI-registered research analyst or investment adviser.

### Copy D: AI and MCP directories

> Arthscan is an MCP server and API for the Indian stock market. Connect it to Claude, ChatGPT, Cursor or any MCP client, and your assistant can pull NSE quotes, price history, financials, screens, sector data and FII and DII flows from one source.
>
> Remote connectors sign in with OAuth. Local clients use a personal token and the `arthscan-mcp` package. Everything is on the same free plan of 50 calls a day, and the data is also browsable at arthscan.me.

Before using Copy D, publish the `arthscan-mcp` package (it isn't on npm yet) or remove the local client sentence. Before using Copy B, confirm you are happy naming competitors.
