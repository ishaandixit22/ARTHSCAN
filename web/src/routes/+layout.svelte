<script lang="ts">
  import "../app.css";
  import { page } from "$app/state";
  import Search from "$lib/components/Search.svelte";
  import TickerTape from "$lib/components/TickerTape.svelte";
  import { BRAND } from "$lib/brand";

  let { data, children } = $props();

  // On phones the menu scrolls sideways; fade the edge while more items are hidden.
  let navEl: HTMLElement | undefined = $state();
  let moreRight = $state(false);
  function updateFade() {
    if (navEl) moreRight = navEl.scrollLeft + navEl.clientWidth < navEl.scrollWidth - 4;
  }
  $effect(() => {
    void page.url.pathname;
    navEl?.querySelector(".active")?.scrollIntoView({ inline: "nearest", block: "nearest" });
    updateFade();
  });

  // Derived so the Live tab appears or disappears on sign-in/out without a reload.
  const nav = $derived([
    { href: "/", label: "Markets" },
    ...(data.live ? [{ href: "/live", label: "Live" }] : []),
    { href: "/heatmap", label: "Heatmap" },
    { href: "/signals", label: "Signals" },
    { href: "/screener", label: "Screener" },
    { href: "/sectors", label: "Sectors" },
    { href: "/stocks", label: "Stocks" },
    { href: "/valuations", label: "Valuations" },
    { href: "/deliveries", label: "Deliveries" },
    { href: "/fii-dii", label: "FII / DII" },
    { href: "/news", label: "News" },
    { href: "/ipos", label: "IPOs" },
    { href: "/mutual-funds", label: "Mutual Funds" },
    { href: "/developers", label: "API & MCP" },
  ]);
  const isActive = (href: string) => (href === "/" ? page.url.pathname === "/" : page.url.pathname.startsWith(href));
</script>

<svelte:window onresize={updateFade} />

<TickerTape quotes={data.ticker} liveAccess={!!data.live} />

<header>
  <div class="wrap bar">
    <a class="logo" href="/" aria-label="{BRAND} home">
      <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><rect width="32" height="32" rx="8" fill="var(--brand)" /><path d="M7 22l6-7 4 4 8-10" fill="none" stroke="var(--panel)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>
      <span>{BRAND}</span>
    </a>
    <Search />
    <div class="account">
      {#if data.account}
        <a href="/settings/tokens" class="btn small">{data.account.name}</a>
      {:else}
        <a href="/login" class="btn small primary">Sign in</a>
      {/if}
    </div>
  </div>
  <nav class="wrap" class:more-right={moreRight} aria-label="Main" bind:this={navEl} onscroll={updateFade}>
    {#each nav as item}
      <a href={item.href} class:active={isActive(item.href)} aria-current={isActive(item.href) ? "page" : undefined}>{item.label}</a>
    {/each}
  </nav>
</header>

<main class="wrap">
  {@render children()}
</main>

<footer>
  <div class="wrap">
    <p>
      Prices are end-of-day from NSE unless marked Live. {BRAND} is not a SEBI-registered research analyst or
      investment adviser; nothing here is investment advice.
    </p>
  </div>
</footer>

<style>
  header { background: var(--panel); border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 10; }
  .bar { display: flex; align-items: center; gap: 20px; height: 60px; }
  .logo { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 18px; letter-spacing: -0.02em; color: var(--ink); }
  .account { margin-left: auto; }
  nav { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; }
  nav::-webkit-scrollbar { display: none; }
  nav.more-right { mask-image: linear-gradient(to right, #000 80%, transparent); }
  nav a { padding: 8px 10px 10px; font-size: 14px; color: var(--ink-2); border-bottom: 2px solid transparent; white-space: nowrap; }
  nav a.active { color: var(--ink); border-bottom-color: var(--brand); font-weight: 500; }
  footer { border-top: 1px solid var(--line); padding: 20px 0 32px; color: var(--ink-3); font-size: 13px; }
  @media (max-width: 640px) {
    .bar { gap: 10px; }
    .logo span { display: none; }
  }
</style>
