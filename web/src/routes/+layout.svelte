<script lang="ts">
  import "../app.css";
  import { page } from "$app/state";
  import MarketsMenu from "$lib/components/MarketsMenu.svelte";
  import Search from "$lib/components/Search.svelte";
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";
  import TickerTape from "$lib/components/TickerTape.svelte";
  import { BRAND } from "$lib/brand";
  import { isActive, navGroups, TOP_LINKS } from "$lib/nav";

  let { data, children } = $props();

  // Derived so Live joins the menu on sign-in without a reload.
  const groups = $derived(navGroups(!!data.live));

</script>

<TickerTape quotes={data.ticker} liveAccess={!!data.live} />

<header>
  <div class="wrap bar">
    <a class="logo" href="/" aria-label="{BRAND} home">
      <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true"><path d="M5 23l7-8 5 5 10-12" fill="none" stroke="var(--mark)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" /><circle cx="27" cy="8" r="2.6" fill="var(--mark)" /></svg>
      <span>{BRAND}</span>
    </a>
    <nav class="primary" aria-label="Main">
      <MarketsMenu {groups} />
      {#each TOP_LINKS as r (r.href)}
        <a href={r.href} class="link" class:current={isActive(r, page.url.pathname)} aria-current={isActive(r, page.url.pathname) ? "page" : undefined}>{r.label}</a>
      {/each}
    </nav>
    <Search />
    <ThemeToggle />
    <div class="account">
      {#if data.account}
        <a href="/settings/tokens" class="btn small">{data.account.name}</a>
      {:else}
        <a href="/login" class="btn small primary">Sign in</a>
      {/if}
    </div>
  </div>
</header>


<main class="wrap">
  {@render children()}
</main>

<footer>
  <div class="wrap foot">
    <a class="logo small" href="/" aria-label="{BRAND} home">
      <svg viewBox="0 0 32 32" width="18" height="18" aria-hidden="true"><path d="M5 23l7-8 5 5 10-12" fill="none" stroke="var(--mark)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" /><circle cx="27" cy="8" r="2.6" fill="var(--mark)" /></svg>
      <span>{BRAND}</span>
    </a>
    <p>
      Prices are end-of-day from NSE unless marked Live. {BRAND} is not a SEBI-registered research analyst or
      investment adviser; nothing here is investment advice.
      {#if data.logoKey}<a href="https://logo.dev" target="_blank" rel="noopener">Logos provided by Logo.dev</a>.{/if}
    </p>
  </div>
</footer>

<style>
  /* Glass header: the page scrolls under it, softened. */
  header { background: var(--glass); backdrop-filter: saturate(1.4) blur(16px); -webkit-backdrop-filter: saturate(1.4) blur(16px); box-shadow: 0 1px 0 var(--line); position: sticky; top: 0; z-index: 20; }
  .bar { display: flex; align-items: center; gap: 28px; height: 62px; }
  .logo { display: flex; align-items: center; gap: 10px; font: 600 17px var(--font); letter-spacing: -0.03em; color: var(--ink); flex-shrink: 0; }
  .logo:hover { color: var(--ink); }
  .logo svg { transition: transform 0.4s var(--spring); }
  .logo:hover svg { transform: translateY(-2px) rotate(-6deg); }
  .primary { display: flex; align-items: center; gap: 24px; }
  .link { position: relative; display: inline-flex; align-items: center; height: 62px; font-size: 13.5px; font-weight: 500; color: var(--ink-2); }
  .link:hover, .link.current { color: var(--ink); }
  .link.current::after { content: ""; position: absolute; left: 0; right: 0; bottom: 14px; height: 2px; border-radius: 2px; background: var(--accent); }
  .account { flex-shrink: 0; }

  footer { margin-top: 40px; background: var(--panel); padding: 40px 0 48px; color: var(--ink-3); font-size: 12.5px; }
  .foot { display: flex; gap: 40px; align-items: flex-start; }
  .foot p { max-width: 720px; line-height: 1.7; }
  .logo.small { font-size: 15px; color: var(--ink-2); }

  @media (max-width: 1080px) { .bar { gap: 20px; } .primary { gap: 18px; } }
  @media (max-width: 860px) {
    .primary .link { display: none; } /* they move into the Markets panel */
    .bar { gap: 16px; }
  }
  @media (max-width: 640px) {
    .logo span { display: none; }
    .bar { gap: 12px; height: 58px; }
    .foot { flex-direction: column; gap: 14px; }
  }
</style>
