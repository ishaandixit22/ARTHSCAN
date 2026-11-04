<script lang="ts">
  import { goto } from "$app/navigation";
  import Logo from "$lib/components/Logo.svelte";
  import { price, pct, tone } from "$lib/format";
  import { loadSearchIndex, searchLocally } from "$lib/searchIndex";

  // `lead` is the front page's big search: its own placeholder and a Look up button,
  // and it leaves the "/" shortcut to the masthead's search.
  let { lead = false, placeholder = "Search stocks" }: { lead?: boolean; placeholder?: string } = $props();
  let q = $state("");
  let results = $state<any[]>([]);
  let open = $state(false);
  let active = $state(-1);
  let timer: ReturnType<typeof setTimeout>;
  let input: HTMLInputElement | undefined = $state();
  // Logo.dev allows 100 requests a minute per visitor, so logos wait for a pause in typing.
  let typing = $state(false);
  let pause: ReturnType<typeof setTimeout>;

  // "/" or ⌘K / Ctrl+K jumps to search from anywhere (except while typing in a field).
  function onGlobalKey(e: KeyboardEvent) {
    if (lead) return;
    const typing = (e.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable]");
    if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
      e.preventDefault();
      input?.focus();
      input?.select();
    }
  }

  function onInput() {
    clearTimeout(timer);
    clearTimeout(pause);
    typing = true;
    pause = setTimeout(() => (typing = false), 250);
    void loadSearchIndex();
    const query = q.trim();
    if (!query) {
      results = [];
      open = false;
      return;
    }
    // Answered in the browser when the company table has arrived; the server covers the rest.
    const local = searchLocally(query);
    if (local?.length) {
      results = local;
      open = true;
      active = -1;
      return;
    }
    timer = setTimeout(async () => {
      const res = await fetch(`/search.json?q=${encodeURIComponent(query)}`);
      if (res.ok && q.trim() === query) {
        results = (await res.json()).results;
        open = true;
        active = -1;
      }
    }, 250);
  }

  function choose(symbol: string) {
    open = false;
    q = "";
    results = [];
    goto(`/stock/${symbol}`);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      active = Math.min(active + 1, results.length - 1);
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      active = Math.max(active - 1, 0);
      e.preventDefault();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = results[active] ?? results[0];
      if (pick) choose(pick.symbol);
    } else if (e.key === "Escape") open = false;
  }
</script>

<svelte:window onkeydown={onGlobalKey} />

<div class="search" class:lead>
  <svg class="glass" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="m10.5 10.5 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
  <input
    bind:this={input}
    type="search"
    {placeholder}
    aria-label="Search stocks"
    bind:value={q}
    oninput={onInput}
    onkeydown={onKey}
    onfocus={() => (loadSearchIndex(), (open = results.length > 0))}
    onblur={() => setTimeout(() => (open = false), 150)}
  />
  {#if lead}
    <button class="go" type="button" onclick={() => (results[0] ? choose(results[0].symbol) : input?.focus())}>Look up</button>
  {:else}
    <kbd aria-hidden="true">/</kbd>
  {/if}
  {#if open && results.length}
    <ul role="listbox">
      {#each results as r, i (r.symbol)}
        <li role="option" aria-selected={i === active}>
          <button type="button" class:active={i === active} onmousedown={() => choose(r.symbol)}>
            <span class="who"><Logo isin={r.isin} symbol={r.symbol} size={24} hold={typing} /><b>{r.symbol}</b> <small>{r.name}</small></span>
            <span class="num">{price(r.close)} <small class={tone(r.change_pct)}>{pct(r.change_pct)}</small></span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .search { position: relative; flex: 1; max-width: 320px; min-width: 0; }
  input { width: 100%; padding: 0 34px 0 34px; border-color: var(--ink); background: var(--paper-hi); }
  input::-webkit-search-cancel-button { display: none; }
  .glass { position: absolute; left: 12px; top: 12px; color: var(--ink-2); pointer-events: none; }
  kbd {
    position: absolute; right: 9px; top: 9px; min-width: 20px; height: 20px; padding: 0 5px; display: grid; place-items: center;
    font: 700 11px var(--font); color: var(--ink-2); border: 1px solid var(--line-2); border-radius: 2px; pointer-events: none;
  }
  input:focus ~ kbd { display: none; }
  ul {
    position: absolute; top: 42px; left: 0; right: 0; z-index: 30; margin: 0; padding: 0; list-style: none; min-width: 300px;
    background: var(--bg); border-top: var(--rule-heavy); border-bottom: 1px solid var(--ink); box-shadow: var(--float);
  }
  button {
    width: 100%; display: flex; justify-content: space-between; gap: 12px; padding: 9px 12px; border: 0; border-bottom: 1px solid var(--line);
    background: none; color: var(--ink); font: 600 14.5px var(--font); font-stretch: 90%; text-align: left; cursor: pointer;
  }
  button.active, button:hover { background: var(--panel-2); }
  small { color: var(--ink-3); font-weight: 500; }
  small.up { color: var(--up); }
  small.down { color: var(--down); }
  .num { font-size: 13px; font-stretch: 82%; white-space: nowrap; }
  @media (max-width: 640px) { kbd { display: none; } input { padding-right: 12px; } }
  /* The front page's search: taller, inked, with its own action. */
  .lead { max-width: none; display: flex; }
  .lead input { height: 50px; font-size: 16px; padding-left: 40px; border-width: 2px; border-right: 0; border-radius: 2px 0 0 2px; }
  .lead .glass { top: 18px; left: 14px; }
  .lead .go {
    width: auto; flex-shrink: 0; height: 50px; padding: 0 18px; border: 0; border-radius: 0 2px 2px 0; background: var(--ink); color: var(--on-ink);
    font: 800 14px var(--font); font-stretch: 78%; text-transform: uppercase; letter-spacing: 0.06em; justify-content: center; align-items: center;
  }
  .lead .go:hover { background: var(--brand-2); }
  .lead ul { top: 52px; }
  .who { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-flex; align-items: center; gap: 8px; }
</style>
