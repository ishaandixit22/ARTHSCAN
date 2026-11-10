<script lang="ts">
  import "../app.css";
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount, type Component } from "svelte";
  import BottomNav from "$lib/components/BottomNav.svelte";
  import MarketsMenu from "$lib/components/MarketsMenu.svelte";
  import NavDropdown from "$lib/components/NavDropdown.svelte";
  import NavIcon from "$lib/components/NavIcon.svelte";
  import PreviewPrompt from "$lib/components/PreviewPrompt.svelte";
  import Search from "$lib/components/Search.svelte";
  import SiteFooter from "$lib/components/SiteFooter.svelte";
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";
  import TickerTape from "$lib/components/TickerTape.svelte";
  import { BRAND } from "$lib/brand";
  import { ICON, isActive, navGroups, TOP_LINKS } from "$lib/nav";
  import { usesFold } from "$lib/preview";
  import { pageSeo } from "$lib/seo";
  import { viewport } from "$lib/viewport.svelte";

  let { data, children } = $props();

  const seo = $derived(pageSeo(page.url.pathname));
  // Signed out on a market page: the top of the page, then a sign-in prompt.
  const fold = $derived(!!data.preview && usesFold(page.url.pathname));
  // Tells search engines the faded part is gated, so showing them the full page isn't mistaken for cloaking.
  const foldLd = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org", "@type": "WebPage", isAccessibleForFree: false,
    hasPart: { "@type": "WebPageElement", isAccessibleForFree: false, cssSelector: ".preview-fold" },
  })}<\/script>`;
  // Derived so Live joins the menu on sign-in without a reload.
  const groups = $derived(navGroups(!!data.live));
  // The edition line under the masthead: today's date in India.
  const edition = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

  // The phone header's two panels. Only one is ever open, and following a link closes it.
  let panel = $state<"menu" | "search" | null>(null);
  let searchFor = $state("");
  const openSearch = (query = "") => { searchFor = query; panel = "search"; };
  afterNavigate(() => (panel = null));
  // Desktop never downloads the panels. Phones fetch them once the page is idle, so a tap opens them at once.
  let Drawer = $state<Component<any> | null>(null);
  let Finder = $state<Component<any> | null>(null);
  const loadPanels = () => {
    import("$lib/components/SiteDrawer.svelte").then((m) => (Drawer = m.default as Component<any>));
    import("$lib/components/SiteSearch.svelte").then((m) => (Finder = m.default as Component<any>));
  };
  $effect(() => {
    if (!viewport.compact || (Drawer && Finder)) return;
    if (panel) return loadPanels();
    const idle = window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 1500));
    idle(loadPanels);
  });
  onMount(() => {
    // A tap made before the app had started (see static/theme.js).
    const early = (window as any).__earlyTap;
    if (early === "menu" || early === "search") panel = early;
  });
</script>

<svelte:head>
  {#if seo.description}<meta name="description" content={seo.description} />{/if}
  {#if seo.canonical}<link rel="canonical" href={seo.canonical} />{/if}
  {#if seo.noindex}<meta name="robots" content="noindex" />{/if}
  <meta property="og:site_name" content={BRAND} />
  {#if fold}{@html foldLd}{/if}
</svelte:head>

<TickerTape quotes={data.ticker} liveAccess={!!data.live} />

<!-- Phones: one sticky bar that needs no data, so it's there and working from first paint. -->
<header class="phone-bar">
  <button type="button" class="tap" data-early="menu" aria-label="Open menu" aria-haspopup="dialog" aria-expanded={panel === "menu"} onclick={() => (panel = "menu")}><NavIcon d={ICON.menu} size={24} /></button>
  <a class="phone-logo" href="/" aria-label="{BRAND} home">{BRAND.toUpperCase()}</a>
  <button type="button" class="tap" data-early="search" aria-label="Search stocks and pages" aria-haspopup="dialog" aria-expanded={panel === "search"} onclick={() => openSearch()}><NavIcon d={ICON.search} size={22} /></button>
  {#if data.account}
    <a class="tap" href="/settings/tokens" aria-label="Your account" data-clarity-mask="true"><NavIcon d={ICON.account} size={22} /></a>
  {:else}
    <a class="phone-signin" href="/login">Sign in</a>
  {/if}
</header>

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
  {#if fold}
    <div class="preview-fold">{@render children()}</div>
    <PreviewPrompt />
  {:else}
    {@render children()}
  {/if}
</main>

<SiteFooter logoKey={data.logoKey} />

<BottomNav onmore={() => (panel = "menu")} moreOpen={panel === "menu"} />

{#if panel === "menu" && Drawer}
  <Drawer live={!!data.live} account={data.account} onclose={() => (panel = null)} onsearch={openSearch} />
{:else if panel === "search" && Finder}
  <Finder live={!!data.live} account={data.account} initial={searchFor} onclose={() => (panel = null)} onmenu={() => (panel = "menu")} />
{/if}

<style>
  /* overflow: clip, not hidden: the clipped part can't be scrolled into view by focus or a link. The fade sits at the
     cut, so on a page shorter than the cut it's clipped away and nothing is dimmed. */
  .preview-fold { position: relative; max-height: 1150px; overflow: clip; }
  .preview-fold::after { content: ""; position: absolute; top: 950px; left: 0; right: 0; height: 200px; background: linear-gradient(transparent, var(--bg)); pointer-events: none; z-index: 5; }
  @media (max-width: 860px) {
    .preview-fold { max-height: 1000px; }
    .preview-fold::after { top: 800px; }
  }
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
  /* The phone bar replaces the masthead and section rail at this width. */
  .phone-bar { display: none; }
  @media (max-width: 860px) {
    .mast, .sections { display: none; }
    .phone-bar {
      position: sticky; top: 0; z-index: 20; display: grid; grid-template-columns: var(--tap) minmax(0, 1fr) var(--tap) auto; align-items: center;
      height: var(--chrome-top); padding: env(safe-area-inset-top) max(8px, env(safe-area-inset-right)) 0 max(4px, env(safe-area-inset-left));
      background: var(--bg); border-bottom: 3px double var(--ink);
    }
    .tap { display: grid; place-items: center; width: var(--tap); height: var(--tap); padding: 0; border: 0; background: none; color: var(--ink); cursor: pointer; -webkit-tap-highlight-color: transparent; }
    .tap:active { background: var(--panel-2); }
    .phone-logo { display: flex; align-items: center; min-height: var(--tap); padding-left: 4px; font: 900 28px/1 var(--display); font-stretch: 62%; letter-spacing: 0.01em; color: var(--ink); white-space: nowrap; }
    .phone-logo:hover { color: var(--ink); }
    .phone-signin { display: flex; align-items: center; min-height: 38px; margin-left: 2px; padding: 0 10px; background: var(--ink); color: var(--on-ink); border-radius: var(--radius-s); font: 750 12px var(--font); font-stretch: 85%; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
    .phone-signin:hover { color: var(--on-ink); }
  }
</style>
