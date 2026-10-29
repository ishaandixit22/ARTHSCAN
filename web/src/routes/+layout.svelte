<script lang="ts">
  import "../app.css";
  import { page } from "$app/state";
  import MarketsMenu from "$lib/components/MarketsMenu.svelte";
  import NavIcon from "$lib/components/NavIcon.svelte";
  import Search from "$lib/components/Search.svelte";
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";
  import TickerTape from "$lib/components/TickerTape.svelte";
  import { BRAND } from "$lib/brand";
  import { isActive, marketTools, RESEARCH } from "$lib/nav";

  let { data, children } = $props();

  // Derived so Live joins the tools on sign-in without a reload.
  const tools = $derived(marketTools(!!data.live));
  const inTools = $derived(tools.some((t) => isActive(t, page.url.pathname)));

</script>

<TickerTape quotes={data.ticker} liveAccess={!!data.live} />

<header>
  <div class="wrap bar">
    <a class="logo" href="/" aria-label="{BRAND} home">
      <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true"><path d="M5 23l7-8 5 5 10-12" fill="none" stroke="var(--mark)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" /><circle cx="27" cy="8" r="2.6" fill="var(--mark)" /></svg>
      <span>{BRAND}</span>
    </a>
    <nav class="primary" aria-label="Main">
      <MarketsMenu {tools} />
      {#each RESEARCH as r (r.href)}
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

{#if inTools}
  <nav class="strip" aria-label="Market tools">
    <div class="wrap strip-row">
      {#each tools as t (t.href)}
        {@const on = isActive(t, page.url.pathname)}
        <a href={t.href} class:on aria-current={on ? "page" : undefined}><NavIcon d={t.icon} size={14} />{t.label}</a>
      {/each}
    </div>
  </nav>
{/if}

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
    </p>
  </div>
</footer>

<style>
  header { background: var(--bg); border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 20; }
  .bar { display: flex; align-items: center; gap: 28px; height: 56px; }
  .logo { display: flex; align-items: center; gap: 9px; font-weight: 700; font-size: 16px; letter-spacing: -0.02em; color: var(--ink); flex-shrink: 0; }
  .logo:hover { color: var(--ink); }
  .primary { display: flex; align-items: center; gap: 24px; }
  .link { position: relative; display: inline-flex; align-items: center; height: 56px; font-size: 13.5px; font-weight: 500; color: var(--ink-2); }
  .link:hover, .link.current { color: var(--ink); }
  .link.current::after { content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 1px; background: var(--accent); }
  .account { flex-shrink: 0; }

  /* Tool strip: the same tools as the Markets menu, one click apart; the current one carries the accent line.
     It scrolls away with the page (the Markets menu stays in the sticky bar) and wraps on phones so no tool is cut off. */
  .strip { border-bottom: 1px solid var(--line); }
  .strip-row { display: flex; flex-wrap: wrap; column-gap: 26px; }
  .strip a { position: relative; display: inline-flex; align-items: center; gap: 7px; height: 40px; font-size: 13px; color: var(--ink-3); white-space: nowrap; flex-shrink: 0; }
  .strip a:hover { color: var(--ink); }
  .strip a.on { color: var(--ink); }
  .strip a.on :global(svg) { color: var(--mark); }
  .strip a.on::after { content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 1px; background: var(--accent); }

  footer { margin-top: 24px; border-top: 1px solid var(--line); padding: 28px 0 40px; color: var(--ink-3); font-size: 12.5px; }
  .foot { display: flex; gap: 28px; align-items: flex-start; }
  .foot p { max-width: 720px; }
  .logo.small { font-size: 14px; color: var(--ink-2); }

  @media (max-width: 1080px) { .bar { gap: 20px; } .primary { gap: 18px; } }
  @media (max-width: 860px) {
    .primary .link { display: none; } /* they move into the Markets panel */
    .bar { gap: 16px; }
  }
  @media (max-width: 640px) {
    .logo span { display: none; }
    .bar { gap: 14px; }
    .strip-row { column-gap: 20px; }
    .strip a { height: 36px; }
    .foot { flex-direction: column; gap: 12px; }
  }
</style>
