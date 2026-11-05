<script lang="ts">
  import "../app.css";
  import { page } from "$app/state";
  import MarketsMenu from "$lib/components/MarketsMenu.svelte";
  import NavDropdown from "$lib/components/NavDropdown.svelte";
  import Search from "$lib/components/Search.svelte";
  import SiteFooter from "$lib/components/SiteFooter.svelte";
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";
  import TickerTape from "$lib/components/TickerTape.svelte";
  import { BRAND } from "$lib/brand";
  import { isActive, navGroups, TOP_LINKS } from "$lib/nav";

  let { data, children } = $props();

  // Derived so Live joins the menu on sign-in without a reload.
  const groups = $derived(navGroups(!!data.live));
  // The edition line under the masthead: today's date in India.
  const edition = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

</script>

<TickerTape quotes={data.ticker} liveAccess={!!data.live} />

<header class="mast" class:front={page.url.pathname === "/"}>
  <div class="wrap top">
    <p class="edition"><b>Market edition</b><span>{edition}</span></p>
    <a class="logo" href="/" aria-label="{BRAND} home">
      <span class="deva" aria-hidden="true">अर्थ</span><span class="word">{BRAND.toUpperCase()}</span>
    </a>
    <div class="tools">
      <Search />
      <ThemeToggle />
      {#if data.account}
        <a href="/settings/tokens" class="btn small" data-clarity-mask="true">{data.account.name}</a>
      {:else}
        <a href="/login" class="btn small primary">Sign in</a>
      {/if}
    </div>
  </div>
</header>

<nav class="sections" aria-label="Main">
  <div class="wrap row">
    <MarketsMenu {groups} />
    {#each TOP_LINKS as r (r.href)}
      {#if r.menu}
        <NavDropdown item={r} />
      {:else}
        <a href={r.href} class="link" class:current={isActive(r, page.url.pathname)} aria-current={isActive(r, page.url.pathname) ? "page" : undefined}>{r.label}</a>
      {/if}
    {/each}
    <span class="tagline">The stock market, explained as it moves</span>
  </div>
</nav>

<main class="wrap" data-clarity-mask={/^\/(settings|connect|login|calculators)(\/|$)/.test(page.url.pathname) ? "true" : undefined}>
  {@render children()}
</main>

<SiteFooter logoKey={data.logoKey} />

<style>
  /* The masthead: edition line, the name, tools. Full size on the front page, compact inside. */
  .mast { background: var(--bg); }
  .top { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 24px; padding-top: 14px; padding-bottom: 10px; }
  .edition { display: flex; flex-direction: column; font-size: 12.5px; font-stretch: 82%; color: var(--ink-2); line-height: 1.35; }
  .edition b { font-weight: 850; font-stretch: 72%; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink); }
  .logo { display: flex; align-items: baseline; gap: 10px; color: var(--ink); line-height: 0.85; }
  .logo:hover { color: var(--ink); }
  .word { font: 900 46px var(--display); font-stretch: 62%; letter-spacing: 0.01em; }
  .deva { font: 400 30px var(--deva); transform: translateY(-2px); }
  .front .word { font-size: clamp(56px, 7vw, 92px); }
  .front .deva { font-size: clamp(34px, 4.2vw, 54px); }
  .front .top { padding-top: 22px; padding-bottom: 16px; }
  .tools { display: flex; align-items: center; gap: 10px; justify-content: flex-end; min-width: 0; }

  /* Section rail: a double rule above, the paper's section names, sticky. */
  .sections { position: sticky; top: 0; z-index: 20; background: var(--bg); border-top: 4px double var(--ink); border-bottom: 1px solid var(--ink); }
  .row { display: flex; align-items: center; gap: 26px; height: 44px; }
  .link { position: relative; display: inline-flex; align-items: center; height: 44px; font: 800 13.5px var(--font); font-stretch: 75%; text-transform: uppercase; letter-spacing: 0.07em; color: var(--ink); }
  .link:hover { color: var(--brand-2); }
  .link.current::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: var(--ink); }
  .tagline { margin-left: auto; font: italic 400 14px var(--serif); color: var(--ink-2); white-space: nowrap; }

  @media (max-width: 1080px) { .tagline { display: none; } }
  @media (max-width: 860px) {
    .top { grid-template-columns: auto 1fr; }
    .edition { display: none; }
    .sections .link { display: none; } /* they move into the Markets panel */
  }
  @media (max-width: 640px) {
    /* Name on its own line, centred like a paper's flag; tools in a full-width row beneath. */
    .top, .front .top { grid-template-columns: minmax(0, 1fr); justify-items: center; gap: 12px; padding-top: 16px; padding-bottom: 12px; }
    .tools { width: 100%; }
    .tools :global(.search) { max-width: none; }
    .word, .front .word { font-size: 44px; }
    .deva, .front .deva { font-size: 28px; }
    .tools :global(.btn.small) { padding: 0 9px; }
  }
</style>
