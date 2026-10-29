<script lang="ts">
  import { BRAND } from "$lib/brand";
  import LiveStamp from "$lib/components/LiveStamp.svelte";
  import { crore, date, pct, tone } from "$lib/format";
  import { market, useLiveMarket } from "$lib/liveMarket.svelte";

  // Cell shading for the rotation table: stronger colour for bigger moves.
  const shade = (v: number | null, scale: number) =>
    v == null ? "" : `background: color-mix(in srgb, var(${v >= 0 ? "--up" : "--down"}) ${Math.round(Math.min(1, Math.abs(v) / scale) * 45)}%, var(--panel))`;

  let { data } = $props();
  // Live accounts get a "Today" column: each sector's median move from live prices.
  $effect(() => (data.live ? useLiveMarket() : undefined));
  const today = $derived(new Map((data.live ? (market.data?.sectors ?? []) : []).map((s) => [s.sector, s.median_change])));
</script>

<svelte:head><title>Stocks by sector — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>Sectors</h1>
      <p class="sub">Sector tags come from NSE's broad-market index lists; stocks outside those indices are unclassified.</p>
    </div>
  </div>

  <section class="card">
    <div class="card-head"><h2>Sector rotation</h2><span class="sub">Median return of liquid stocks · {#if today.size}Today <LiveStamp close="" />; longer periods{/if} as of {date(data.rotation.as_of)}</span></div>
    <div class="table-scroll">
      <table>
        <thead><tr><th>Sector</th>{#if today.size}<th>Today</th>{/if}<th>1W</th><th>1M</th><th>3M</th><th class="wide-only">6M</th><th class="wide-only">1Y</th><th class="wide-only">Above 50D avg</th></tr></thead>
        <tbody>
          {#each data.rotation.sectors as s (s.sector)}
            <tr>
              <td><a href="/sectors/{encodeURIComponent(s.sector)}">{s.sector}</a> <span class="sub">({s.stocks})</span></td>
              {#if today.size}<td style={shade(today.get(s.sector) ?? null, 3)}>{pct(today.get(s.sector) ?? null)}</td>{/if}
              <td style={shade(s.ret_1w, 6)}>{pct(s.ret_1w)}</td>
              <td style={shade(s.ret_1m, 12)}>{pct(s.ret_1m)}</td>
              <td style={shade(s.ret_3m, 20)}>{pct(s.ret_3m)}</td>
              <td class="wide-only" style={shade(s.ret_6m, 30)}>{pct(s.ret_6m)}</td>
              <td class="wide-only" style={shade(s.ret_1y, 50)}>{pct(s.ret_1y)}</td>
              <td class="wide-only">{s.pct_above_sma50}%</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

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
  @media (max-width: 640px) { .wide-only { display: none; } }
  .row { display: flex; justify-content: space-between; font-size: 14px; font-variant-numeric: tabular-nums; }
  b { font-weight: 600; }
</style>
