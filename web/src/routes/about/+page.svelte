<script lang="ts">
  import { BRAND, DOMAIN } from "$lib/brand";
  import Prose from "$lib/components/Prose.svelte";

  const description = `${BRAND} is a free research site for the Indian stock market, covering stocks, mutual funds and IPOs, with an API and MCP server for developers and AI assistants.`;
  const jsonLd = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: BRAND,
    url: `https://${DOMAIN}`,
    logo: `https://${DOMAIN}/icon-512.png`,
    description,
  }).replace(/</g, "\\u003c")}<\/script>`;
</script>

<svelte:head>
  <title>About — {BRAND}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href="https://{DOMAIN}/about" />
  {@html jsonLd}
</svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>About {BRAND}</h1>
      <p class="sub">A research site for the Indian stock market, on the web and inside your AI assistant.</p>
    </div>
  </div>

  <Prose>
    <h2>What it is</h2>
    <p>{BRAND} brings together what you need to look into an Indian stock. Each company has a page with its prices, financials, filings and ownership. The rest of the site follows the market around it: sectors, FII and DII flows, bulk and block deals, deliveries, F&amp;O bans, earnings dates, corporate actions, IPOs and mutual funds.</p>
    <p>There is also a <a href="/screener">stock screener</a> and a set of <a href="/calculators">financial calculators</a>. The calculators need no account; everything else is free with a Google sign-in.</p>

    <h2>For developers and AI assistants</h2>
    <p>The same data is available over a REST API and an MCP server, so Claude, ChatGPT, Cursor and other assistants can answer questions from it directly. The <a href="/developers">developer page</a> shows how to connect.</p>

    <h2>Where the data comes from</h2>
    <ul>
      <li>End-of-day prices, filings, flows and deals: NSE and other exchange publications.</li>
      <li>Live prices and intraday charts: Dhan.</li>
      <li>Financial statements, news and mutual fund data: third-party data providers.</li>
    </ul>
    <p>Pages say when a figure is live and when it is from the last close. Data can be late or wrong, so check anything important against the exchange filing. If you spot a mistake, <a href="/contact">tell us</a>.</p>

    <h2>What it isn't</h2>
    <p>{BRAND} is not a SEBI-registered research analyst or investment adviser, and it isn't a broker. Nothing here is a recommendation to buy or sell. It gives you information, and the decisions are yours.</p>
  </Prose>
</div>
