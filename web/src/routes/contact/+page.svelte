<script lang="ts">
  import { BRAND, CONTACT_EMAIL, DOMAIN } from "$lib/brand";
  import Prose from "$lib/components/Prose.svelte";
</script>

<svelte:head>
  <title>Contact — {BRAND}</title>
  <meta name="description" content="Contact {BRAND} about a data error, your account, the API or anything else." />
  <link rel="canonical" href="https://{DOMAIN}/contact" />
</svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>Contact</h1>
      <p class="sub">Email is the best way to reach us.</p>
    </div>
  </div>

  <Prose>
    <p class="address"><a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a></p>

    <h2>What helps us answer</h2>
    <ul>
      <li><b>A data error:</b> the stock or page, the figure you saw and where you saw the correct one.</li>
      <li><b>Your account:</b> write from the email you sign in with. This is also how to ask us to delete your account.</li>
      <li><b>The API or MCP server:</b> the tool or route, the client you use and the error you got. Don't send your token.</li>
      <li><b>More API calls:</b> what you are building and roughly how many calls a day you need.</li>
    </ul>

    <h2>What we can't help with</h2>
    <p>We can't tell you whether to buy or sell anything, since {BRAND} is not a SEBI-registered adviser. We also can't help with orders or accounts at your broker.</p>
  </Prose>
</div>

<style>
  .address { font: 800 clamp(24px, 4vw, 34px)/1.2 var(--display); font-stretch: 72%; overflow-wrap: anywhere; }
</style>
