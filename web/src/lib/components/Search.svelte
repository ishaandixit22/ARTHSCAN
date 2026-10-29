<script lang="ts">
  import { goto } from "$app/navigation";
  import { price, pct, tone } from "$lib/format";

  let q = $state("");
  let results = $state<any[]>([]);
  let open = $state(false);
  let active = $state(-1);
  let timer: ReturnType<typeof setTimeout>;
  let input: HTMLInputElement | undefined = $state();

  // "/" or ⌘K / Ctrl+K jumps to search from anywhere (except while typing in a field).
  function onGlobalKey(e: KeyboardEvent) {
    const typing = (e.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable]");
    if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
      e.preventDefault();
      input?.focus();
      input?.select();
    }
  }

  function onInput() {
    clearTimeout(timer);
    const query = q.trim();
    if (!query) {
      results = [];
      open = false;
      return;
    }
    timer = setTimeout(async () => {
      const res = await fetch(`/search.json?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        results = (await res.json()).results;
        open = true;
        active = -1;
      }
    }, 120);
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

<div class="search">
  <svg class="glass" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="m10.5 10.5 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
  <input
    bind:this={input}
    type="search"
    placeholder="Search stocks"
    aria-label="Search stocks"
    bind:value={q}
    oninput={onInput}
    onkeydown={onKey}
    onfocus={() => (open = results.length > 0)}
    onblur={() => setTimeout(() => (open = false), 150)}
  />
  <kbd aria-hidden="true">/</kbd>
  {#if open && results.length}
    <ul role="listbox">
      {#each results as r, i}
        <li role="option" aria-selected={i === active}>
          <button type="button" class:active={i === active} onmousedown={() => choose(r.symbol)}>
            <span class="who"><b>{r.symbol}</b> <small>{r.name}</small></span>
            <span class="num">{price(r.close)} <small class={tone(r.change_pct)}>{pct(r.change_pct)}</small></span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .search { position: relative; flex: 1; max-width: 340px; min-width: 0; margin-left: auto; }
  input { width: 100%; padding: 0 34px 0 34px; border-radius: 999px; background: var(--panel); border-color: var(--line); }
  input:focus { border-color: var(--accent); }
  input::-webkit-search-cancel-button { display: none; }
  .glass { position: absolute; left: 13px; top: 10px; color: var(--ink-3); pointer-events: none; }
  kbd {
    position: absolute; right: 10px; top: 7px; min-width: 20px; height: 20px; padding: 0 5px; display: grid; place-items: center;
    font: 500 11px var(--mono); color: var(--ink-3); border: 1px solid var(--line-2); border-radius: 4px; pointer-events: none;
  }
  input:focus ~ kbd { display: none; }
  ul {
    position: absolute; top: 40px; left: 0; right: 0; z-index: 30; margin: 0; padding: 4px; list-style: none; min-width: 300px;
    background: var(--panel); border: 1px solid var(--line-2); border-radius: var(--radius); box-shadow: var(--float);
  }
  button {
    width: 100%; display: flex; justify-content: space-between; gap: 12px; padding: 8px 10px; border: 0; border-radius: 6px;
    background: none; color: var(--ink); font: 14px var(--font); text-align: left; cursor: pointer;
  }
  button.active, button:hover { background: var(--panel-2); }
  small { color: var(--ink-3); }
  small.up { color: var(--up); }
  small.down { color: var(--down); }
  .num { font-family: var(--mono); font-size: 12.5px; white-space: nowrap; }
  @media (max-width: 640px) { kbd { display: none; } input { padding-right: 12px; } }
  .who { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
