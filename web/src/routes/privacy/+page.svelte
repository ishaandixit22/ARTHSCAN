<script lang="ts">
  import { BRAND } from "$lib/brand";
</script>

<svelte:head><title>Privacy — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>Privacy</h1>
      <p class="sub">What {BRAND} collects when you use this site, and who helps us with it.</p>
    </div>
  </div>

  <section class="copy">
    <h2>How we measure use of the site</h2>
    <p>We use Microsoft Clarity to see how people use {BRAND}, through usage measures, heatmaps and recordings of sessions. Clarity captures things like the pages you visit, where you click and scroll, and your device and browser, using cookies and similar technologies. Microsoft processes this data for us and may use it as described in the <a href="https://privacy.microsoft.com/privacystatement" target="_blank" rel="noopener">Microsoft Privacy Statement</a>.</p>
    <p>What you type into forms is masked before it leaves your browser, and so are your account name, your account pages and the calculator pages. We also use Cloudflare Web Analytics for overall visitor counts.</p>

    <h2>If you sign in</h2>
    <p>Signing in with Google gives us your name and email address, which we keep to run your account. API tokens you create are tied to that account.</p>

    <h2>Your choices</h2>
    <p>You can browse the public pages without an account. You can block or clear cookies in your browser settings, and the site will keep working. To have your account deleted, <a href="/contact">contact us</a>.</p>
  </section>
</div>

<style>
  .copy { max-width: 720px; font: 17px/1.65 var(--serif); }
  .copy h2 { margin: 28px 0 8px; font: 800 22px var(--display); font-stretch: 72%; }
  .copy p { margin: 0 0 14px; }
  .copy a { text-decoration: underline; text-underline-offset: 3px; }
</style>
