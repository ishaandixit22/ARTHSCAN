<script lang="ts">
  // Full-screen search on phones: companies from the search API, plus pages of the site.
  // Nothing loads until you type, and only the latest keystroke's request is kept.
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import Logo from "$lib/components/Logo.svelte";
  import NavIcon from "$lib/components/NavIcon.svelte";
  import Sheet from "$lib/components/Sheet.svelte";
  import { price, pct, tone } from "$lib/format";
  import { drawerGroups, findDestinations, flatDestinations, ICON } from "$lib/nav";

  let { live, account, initial = "", onclose, onmenu }: { live: boolean; account: { name: string } | null; initial?: string; onclose: () => void; onmenu?: () => void } = $props();

  let input: HTMLInputElement | undefined = $state();
  let q = $state(initial);
  let stocks = $state<any[]>([]);
  let status = $state<"idle" | "loading" | "done" | "failed">("idle");
  let typing = $state(false);
  let timer: ReturnType<typeof setTimeout>;
  let pause: ReturnType<typeof setTimeout>;
  let request: AbortController | null = null;

  const pages = $derived(findDestinations(flatDestinations(drawerGroups(live, !!account)).filter((d) => d.href), q, 5));
  const QUICK = [
    { href: "/screener", label: "Stock screener" }, { href: "/ipos", label: "IPOs" }, { href: "/heatmap", label: "Heatmap" },
    { href: "/fii-dii", label: "FII / DII" }, { href: "/earnings", label: "Earnings" }, { href: "/news", label: "News" },
  ];

  function lookUp() {
    clearTimeout(timer);
    clearTimeout(pause);
    request?.abort();
    const query = q.trim();
    if (!query) {
      stocks = [];
      status = "idle";
      typing = false;
      return;
    }
    status = "loading";
    typing = true;
    pause = setTimeout(() => (typing = false), 350);
    timer = setTimeout(async () => {
      const ask = (request = new AbortController());
      try {
        const res = await fetch(`/search.json?q=${encodeURIComponent(query)}`, { signal: ask.signal });
        if (!res.ok) throw new Error();
        stocks = (await res.json()).results;
        status = "done";
      } catch (e) {
        if ((e as Error).name !== "AbortError") status = "failed";
      }
    }, 220);
  }

  function submit(e: Event) {
    e.preventDefault();
    if (stocks[0]) goto(`/stock/${encodeURIComponent(stocks[0].symbol)}`);
    else if (pages[0]?.href) goto(pages[0].href);
  }

  onMount(() => {
    input?.focus();
    if (initial) lookUp();
    return () => {
      clearTimeout(timer);
      clearTimeout(pause);
      request?.abort();
    };
  });
</script>

<Sheet label="Search" side="full" {onclose}>
  {#snippet children(close)}
    <form class="bar" role="search" onsubmit={submit}>
      <button type="button" class="back" aria-label="Close search" onclick={close}><NavIcon d={ICON.close} size={22} /></button>
      <input bind:this={input} type="search" bind:value={q} oninput={lookUp} placeholder="Company, symbol or page" aria-label="Search companies and pages" enterkeyhint="search" autocomplete="off" autocapitalize="characters" spellcheck="false" />
    </form>

    <div class="results">
      {#if !q.trim()}
        <h2>Go to</h2>
        <ul class="quick">
          {#each QUICK as l (l.href)}<li><a href={l.href}>{l.label}</a></li>{/each}
          <li><button type="button" onclick={() => (close(), onmenu?.())}>Full menu</button></li>
        </ul>
        <p class="hint">Type a company's name or symbol, such as ITC or HDFC Bank.</p>
      {:else}
        {#if stocks.length}
          <h2>Companies</h2>
          <ul>
            {#each stocks as r (r.symbol)}
              <li>
                <a class="stock" href="/stock/{encodeURIComponent(r.symbol)}">
                  <Logo isin={r.isin} symbol={r.symbol} size={32} hold={typing} />
                  <span class="who"><b>{r.symbol}</b><small>{r.name}</small></span>
                  <span class="num">{price(r.close)}<small class={tone(r.change_pct)}>{pct(r.change_pct)}</small></span>
                </a>
              </li>
            {/each}
          </ul>
        {:else if status === "loading"}
          <p class="hint" role="status">Searching…</p>
        {:else if status === "failed"}
          <p class="hint" role="alert">Search isn't reachable right now. Check your connection and try again.</p>
        {:else if status === "done"}
          <p class="hint">No company matches “{q.trim()}”.</p>
        {/if}
        {#if pages.length}
          <h2>Pages</h2>
          <ul>
            {#each pages as d (d.label + d.href)}
              <li><a class="page" href={d.href}>{#if d.icon}<NavIcon d={d.icon} size={20} />{/if}<span class="who"><b>{d.label}</b><small>{d.group}</small></span></a></li>
            {/each}
          </ul>
        {/if}
      {/if}
    </div>
  {/snippet}
</Sheet>

<style>
  .bar { flex: none; display: flex; align-items: center; gap: 4px; height: 56px; padding: 0 12px 0 4px; border-bottom: 1px solid var(--ink); }
  .back { flex: none; display: grid; place-items: center; width: var(--tap); height: var(--tap); border: 0; background: none; color: var(--ink); cursor: pointer; }
  .bar input { flex: 1; min-width: 0; border-color: var(--ink); }
  .bar input::-webkit-search-cancel-button { -webkit-appearance: none; }
  .results { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 4px 16px 24px; }
  h2 { margin: 14px 0 6px; padding-bottom: 6px; border-bottom: 1.5px solid var(--ink); font-size: 13px; font-weight: 850; font-stretch: 72%; text-transform: uppercase; letter-spacing: 0.07em; }
  ul { list-style: none; margin: 0; padding: 0; }
  .stock, .page { display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 6px 0; border-bottom: 1px solid var(--line); color: var(--ink); }
  .stock:active, .page:active { background: var(--panel-2); }
  .page { min-height: var(--row); }
  .page :global(svg) { color: var(--ink-3); }
  .who { flex: 1; display: grid; min-width: 0; }
  .who b { font-size: 15px; font-weight: 800; font-stretch: 85%; }
  .page .who b { font-weight: 600; font-stretch: 92%; }
  .who small { color: var(--ink-3); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .num { display: grid; justify-items: end; font-size: 14px; font-weight: 700; font-stretch: 85%; white-space: nowrap; }
  .num small { font-size: 12.5px; font-weight: 700; }
  .quick { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
  .quick a, .quick button { display: flex; align-items: center; width: 100%; min-height: var(--row); padding: 0; border: 0; border-bottom: 1px solid var(--line); background: none; color: var(--ink); font: 600 15px var(--font); font-stretch: 90%; text-align: left; cursor: pointer; }
  .hint { padding: 16px 0; font: 15px/1.45 var(--serif); color: var(--ink-2); }
</style>
