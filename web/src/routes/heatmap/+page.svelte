<script lang="ts">
  import { BRAND } from "$lib/brand";
  import { crore, date, pct } from "$lib/format";

  let { data } = $props();
  const h = $derived(data.heatmap);
  // Colour saturates at a move that's large for the period.
  const scale = $derived(({ "1d": 3, "1w": 6, "1m": 10, "3m": 20, "1y": 40 } as Record<string, number>)[data.period] ?? 3);
  function colour(change: number) {
    const t = Math.max(-1, Math.min(1, change / scale));
    const a = 0.15 + Math.abs(t) * 0.75;
    return t >= 0 ? `rgb(18 128 74 / ${a})` : `rgb(199 52 63 / ${a})`;
  }
  const total = $derived(h.sectors.reduce((s: number, g: any) => s + g.turnover, 0));
</script>

<svelte:head><title>Market heatmap — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>Heatmap</h1>
      <p class="sub">The 250 most traded stocks, grouped by sector. Tile size is turnover; colour is the {data.period.toUpperCase()} return. As of {date(h.as_of)}.</p>
    </div>
    <div class="tabs">
      {#each data.periods as p}<a href="?period={p}" class:active={p === data.period} data-sveltekit-noscroll>{p.toUpperCase()}</a>{/each}
    </div>
  </div>

  <div class="map">
    {#each h.sectors as g (g.sector)}
      <section class="sector" style="flex-grow: {Math.max(1, Math.round((g.turnover / total) * 100))}">
        <header><b>{g.sector}</b> <span style="color: {g.change >= 0 ? 'var(--up)' : 'var(--down)'}">{pct(g.change)}</span></header>
        <div class="tiles">
          {#each g.stocks as s (s.symbol)}
            <a class="tile" href="/stock/{s.symbol}" title="{s.name}: {pct(s.change)} · turnover {crore(s.turnover)}"
              style="flex-grow: {Math.max(1, Math.round((s.turnover / g.turnover) * 100))}; background: {colour(s.change)}">
              <span class="sym">{s.symbol}</span><span class="chg">{pct(s.change)}</span>
            </a>
          {/each}
        </div>
      </section>
    {/each}
  </div>
  <p class="sub small">Sector change is turnover-weighted. Market capitalisation isn't available yet, so tiles are sized by trading value.</p>
</div>

<style>
  .map { display: flex; flex-wrap: wrap; gap: 6px; }
  .sector { flex-basis: 260px; min-width: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 6px; display: flex; flex-direction: column; gap: 4px; }
  .sector header { display: flex; justify-content: space-between; gap: 8px; font-size: 12.5px; padding: 0 2px; }
  .sector header b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tiles { display: flex; flex-wrap: wrap; gap: 3px; }
  .tile { flex-basis: 64px; min-height: 46px; border-radius: 4px; padding: 4px 6px; display: flex; flex-direction: column; justify-content: center; color: var(--ink); overflow: hidden; }
  .tile:hover { outline: 2px solid var(--ink); color: var(--ink); }
  .tile .sym { font-size: 11.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tile .chg { font-size: 11px; font-variant-numeric: tabular-nums; }
  .small { font-size: 12.5px; }
</style>
