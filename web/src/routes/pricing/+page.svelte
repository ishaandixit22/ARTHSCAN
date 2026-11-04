<script lang="ts">
  import { BRAND, DOMAIN } from "$lib/brand";
  import Prose from "$lib/components/Prose.svelte";

  const rows = [
    ["Stock pages, screener and market pages", "Free", "No account needed"],
    ["Mutual funds, IPOs and news", "Free", "No account needed"],
    ["Financial calculators", "Free", "No account needed"],
    ["REST API and MCP server", "Free", "Sign in; 50 calls a day"],
  ];
</script>

<svelte:head>
  <title>Pricing — {BRAND}</title>
  <meta name="description" content="{BRAND} is free to use. Browse the site without an account, and use the API and MCP server on a free plan of 50 calls a day." />
  <link rel="canonical" href="https://{DOMAIN}/pricing" />
</svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>Pricing</h1>
      <p class="sub">{BRAND} is free to use. There are no paid plans today.</p>
    </div>
    <a class="btn primary" href="/settings/tokens">Get an API token</a>
  </div>

  <section class="card">
    <div class="card-head"><h2>What's included</h2></div>
    <div class="table-scroll">
      <table>
        <thead><tr><th scope="col">Feature</th><th scope="col" class="left">Price</th><th scope="col" class="left">What you need</th></tr></thead>
        <tbody>
          {#each rows as r (r[0])}<tr><td>{r[0]}</td><td class="left">{r[1]}</td><td class="left">{r[2]}</td></tr>{/each}
        </tbody>
      </table>
    </div>
  </section>

  <Prose>
    <h2>How the API limit works</h2>
    <p>The free plan allows 50 metered calls a day, across the API and MCP server together, and the count resets at midnight IST. A few tools don't count toward it, and the <a href="/developers">developer page</a> marks them as free. Over the limit, calls return HTTP 429 until the reset.</p>

    <h2>Need more calls?</h2>
    <p><a href="/contact">Tell us</a> what you are building and how many calls you need.</p>

    <h2>Will this change?</h2>
    <p>We may add paid plans later. We won't charge you for anything without you first choosing a paid plan.</p>
  </Prose>
</div>
