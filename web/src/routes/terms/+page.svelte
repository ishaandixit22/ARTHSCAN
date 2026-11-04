<script lang="ts">
  import { BRAND, CONTACT_EMAIL, DOMAIN } from "$lib/brand";
  import Prose from "$lib/components/Prose.svelte";

  // Change this date whenever the terms below change.
  const updated = "5 November 2026";
</script>

<svelte:head>
  <title>Terms of use — {BRAND}</title>
  <meta name="description" content="The terms for using {BRAND}, its API and its MCP server." />
  <link rel="canonical" href="https://{DOMAIN}/terms" />
</svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>Terms of use</h1>
      <p class="sub">Last updated {updated}.</p>
    </div>
  </div>

  <Prose>
    <p>These terms apply when you use {DOMAIN}, the {BRAND} API or the {BRAND} MCP server (together, "the service"). By using the service you agree to them. If you don't agree, please don't use it.</p>

    <h2>Not investment advice</h2>
    <p>{BRAND} is not a SEBI-registered research analyst, investment adviser or stockbroker. Everything on the service, including scores, signals, screens, summaries, forecasts and calculator results, is general information. None of it is a recommendation to buy, sell or hold anything, or advice suited to your circumstances. Investing carries risk, including loss of your capital. Past performance doesn't indicate future results. Speak to a qualified adviser before you invest.</p>

    <h2>Accuracy of data</h2>
    <p>Data comes from exchanges and third parties and may be delayed, incomplete or wrong. Prices are end-of-day unless marked live. Calculator results are illustrations based on what you enter and the assumptions shown. Check anything important against the original source before relying on it. The service is provided "as is", and we may change, suspend or remove any part of it at any time.</p>

    <h2>Your account</h2>
    <p>You sign in with a Google account, and you are responsible for what happens under your account and API tokens. Keep tokens private, and revoke any you think have been exposed. You can ask us to delete your account by <a href="/contact">contacting us</a>. Our <a href="/privacy">privacy policy</a> explains what data we keep.</p>

    <h2>Acceptable use</h2>
    <p>You may use the service for your own research, including through an AI assistant or your own code within the API limits. You must not:</p>
    <ul>
      <li>resell, republish or redistribute the data, or use it to build a competing data service;</li>
      <li>scrape the site in bulk, or get around rate limits, quotas or access controls;</li>
      <li>interfere with the service, probe it for weaknesses without our permission, or overload it;</li>
      <li>use it for anything unlawful, including market manipulation.</li>
    </ul>
    <p>We may limit or end access for anyone who breaks these terms.</p>

    <h2>Ownership</h2>
    <p>The site's design, text and software belong to {BRAND}. Market data and company logos belong to their respective owners, and may carry their own licence terms.</p>

    <h2>Third-party links</h2>
    <p>The service links to other sites and shows content from third parties, such as news and filings. We don't control them and aren't responsible for them.</p>

    <h2>Limit of liability</h2>
    <p>To the extent the law allows, {BRAND} isn't liable for any investment or trading loss, loss of profit or data, or any indirect loss arising from your use of the service or your reliance on anything in it. Nothing in these terms limits a right you have that can't be excluded by law.</p>

    <h2>Changes to these terms</h2>
    <p>We may update these terms and will change the date at the top when we do. Continuing to use the service after that means you accept the new terms.</p>

    <h2>Governing law</h2>
    <p>These terms are governed by the laws of India, and the courts of India have jurisdiction over any dispute.</p>

    <h2>Contact</h2>
    <p>Questions about these terms can go to <a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a>.</p>
  </Prose>
</div>
