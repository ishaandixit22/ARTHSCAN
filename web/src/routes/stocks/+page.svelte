<script lang="ts">
  import StockTable from "$lib/components/StockTable.svelte";
  import { BRAND } from "$lib/brand";

  let { data } = $props();
  const LETTERS = ["0", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
</script>

<svelte:head><title>All stocks A–Z — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>All stocks</h1>
      <p class="sub">{data.total} NSE stocks starting with {data.letter === "0" ? "a digit" : data.letter}</p>
    </div>
  </div>

  <nav class="letters" aria-label="Filter by first letter">
    {#each LETTERS as l}
      <a href="?letter={l}" class:active={l === data.letter}>{l === "0" ? "0–9" : l}</a>
    {/each}
  </nav>

  <section class="card">
    <StockTable rows={data.rows} cols={["sector", "close", "change_pct", "ret_1m", "ret_1y", "turnover"]} />
  </section>

  {#if data.pages > 1}
    <div class="pager">
      {#if data.page > 1}<a class="btn small" href="?letter={data.letter}&page={data.page - 1}">← Previous</a>{/if}
      <span class="sub">Page {data.page} of {data.pages}</span>
      {#if data.page < data.pages}<a class="btn small" href="?letter={data.letter}&page={data.page + 1}">Next →</a>{/if}
    </div>
  {/if}
</div>

<style>
  .letters { display: flex; flex-wrap: wrap; gap: 4px; }
  .letters a { position: relative; min-width: 28px; height: 32px; display: grid; place-items: center; padding: 0 6px; font: 500 13px var(--mono); color: var(--ink-3); }
  .letters a:hover { color: var(--ink); background: var(--panel-2); border-radius: 4px; }
  .letters a.active { color: var(--ink); }
  .letters a.active::after { content: ""; position: absolute; left: 6px; right: 6px; bottom: 2px; height: 1px; background: var(--accent); }
  .pager { display: flex; gap: 12px; align-items: center; justify-content: center; }
</style>
