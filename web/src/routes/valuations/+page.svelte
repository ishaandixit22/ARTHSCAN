<script lang="ts">
  import { BRAND } from "$lib/brand";
  import { date, num, pct, tone } from "$lib/format";

  let { data } = $props();
  // Broad and sector indices first; strategy/thematic ones are still searchable via ?index=.
  let filter = $state("");
  const rows = $derived(data.all.indices.filter((i: any) => i.pe != null && i.index_name.toLowerCase().includes(filter.toLowerCase())));

  // P/E history as a simple SVG line with min / median / max guides.
  const hist = $derived((data.history?.history ?? []).filter((h: any) => h.pe != null));
  const W = 720, H = 200, P = 28;
  const ys = $derived(hist.map((h: any) => h.pe as number));
  const lo = $derived(Math.min(...ys)), hi = $derived(Math.max(...ys));
  const x = (i: number) => P + (i / Math.max(1, hist.length - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - lo) / Math.max(0.01, hi - lo)) * (H - 2 * P);
  const path = $derived(hist.map((h: any, i: number) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(h.pe).toFixed(1)}`).join(""));
  const range = $derived(data.history?.pe_range);
</script>

<svelte:head><title>Index valuations — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>Valuations</h1>
      <p class="sub">P/E, P/B and dividend yield of NSE indices, from NSE's daily index report. As of {date(data.all.as_of)}.</p>
    </div>
  </div>

  {#if data.history && hist.length}
    <section class="card">
      <div class="card-head">
        <h2>{data.index}: P/E over the last year</h2>
        {#if range}<span class="sub">now {num(hist[hist.length - 1].pe)} · median {num(range.median)} · range {num(range.min)}–{num(range.max)} · {range.current_percentile}th percentile</span>{/if}
      </div>
      <div class="card-body">
        <svg viewBox="0 0 {W} {H}" role="img" aria-label="{data.index} P/E history">
          {#if range}
            {#each [range.min, range.median, range.max] as v}
              <line x1={P} x2={W - P} y1={y(v)} y2={y(v)} class="guide" />
              <text x={W - P + 4} y={y(v) + 4} class="lbl">{num(v, 1)}</text>
            {/each}
          {/if}
          <path d={path} class="line" />
          <text x={P} y={H - 6} class="lbl">{date(hist[0].date)}</text>
          <text x={W - P} y={H - 6} class="lbl" text-anchor="end">{date(hist[hist.length - 1].date)}</text>
        </svg>
      </div>
    </section>
  {/if}

  <section class="card">
    <div class="card-head">
      <h2>All indices</h2>
      <input placeholder="Filter, e.g. bank, midcap" bind:value={filter} aria-label="Filter indices" />
    </div>
    <div class="table-scroll">
      <table>
        <thead><tr><th>Index</th><th>Close</th><th>Day</th><th>P/E</th><th>P/B</th><th class="wide-only">Div yield</th></tr></thead>
        <tbody>
          {#each rows as i (i.index_name)}
            <tr class:on={i.index_name === data.index}>
              <td><a href="?index={encodeURIComponent(i.index_name)}" data-sveltekit-noscroll>{i.index_name}</a></td>
              <td>{num(i.close)}</td>
              <td class={tone(i.change_pct)}>{pct(i.change_pct)}</td>
              <td>{num(i.pe)}</td>
              <td>{num(i.pb)}</td>
              <td class="wide-only">{pct(i.div_yield, false)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
</div>

<style>
  svg { width: 100%; height: auto; }
  .line { fill: none; stroke: var(--brand); stroke-width: 2; }
  .guide { stroke: var(--line-2); stroke-dasharray: 4 4; }
  .lbl { font-size: 11px; fill: var(--ink-3); }
  tr.on { background: var(--brand-soft); }
  .card-head input { width: 220px; }
  @media (max-width: 640px) { .wide-only { display: none; } .card-head input { width: 100%; } }
</style>
