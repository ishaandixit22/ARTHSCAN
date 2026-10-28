<script lang="ts">
  import { BRAND } from "$lib/brand";
  import { crore, pct, tone } from "$lib/format";

  let { data } = $props();
</script>

<svelte:head><title>Stocks by sector — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>Sectors</h1>
      <p class="sub">Sector tags come from NSE's broad-market index lists; stocks outside those indices are unclassified.</p>
    </div>
  </div>

  <div class="grid grid-3">
    {#each data.sectors as s}
      <a class="card tile" href="/sectors/{encodeURIComponent(s.sector)}">
        <h3>{s.sector}</h3>
        <div class="row">
          <span class="sub">{s.stocks} stocks · {crore(s.turnover)}</span>
        </div>
        <div class="row">
          <span>Day <b class={tone(s.avg_change_pct)}>{pct(s.avg_change_pct)}</b></span>
          <span>1M <b class={tone(s.avg_ret_1m)}>{pct(s.avg_ret_1m)}</b></span>
        </div>
      </a>
    {/each}
  </div>
</div>

<style>
  .tile { padding: 16px; display: grid; gap: 8px; color: inherit; }
  .tile:hover { border-color: var(--brand-2); color: inherit; }
  .row { display: flex; justify-content: space-between; font-size: 14px; font-variant-numeric: tabular-nums; }
  b { font-weight: 600; }
</style>
