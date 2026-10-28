<script lang="ts">
  import { goto } from "$app/navigation";
  import { price, pct, tone } from "$lib/format";

  let q = $state("");
  let results = $state<any[]>([]);
  let open = $state(false);
  let active = $state(-1);
  let timer: ReturnType<typeof setTimeout>;

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

<div class="search">
  <input
    type="search"
    placeholder="Search stocks — name or symbol"
    aria-label="Search stocks"
    bind:value={q}
    oninput={onInput}
    onkeydown={onKey}
    onfocus={() => (open = results.length > 0)}
    onblur={() => setTimeout(() => (open = false), 150)}
  />
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
  .search { position: relative; flex: 1; max-width: 380px; min-width: 0; }
  input { width: 100%; }
  ul {
    position: absolute; top: 40px; left: 0; right: 0; z-index: 20; margin: 0; padding: 4px; list-style: none;
    background: var(--panel); border: 1px solid var(--line-2); border-radius: 10px; box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
  }
  button {
    width: 100%; display: flex; justify-content: space-between; gap: 12px; padding: 8px 10px; border: 0; border-radius: 6px;
    background: none; color: var(--ink); font: 14px var(--font); text-align: left; cursor: pointer;
  }
  button.active, button:hover { background: var(--panel-2); }
  small { color: var(--ink-3); }
  small.up { color: var(--up); }
  small.down { color: var(--down); }
  .num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .who { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
