<script lang="ts">
  import StockTable from "$lib/components/StockTable.svelte";
  import { BRAND, TAGLINE } from "$lib/brand";
  import { cr, crore, date, int, pct, tone } from "$lib/format";

  let { data } = $props();
  const b = $derived(data.summary.breadth ?? {});
  const fii = $derived(data.summary.fii_dii.find((f: any) => f.category === "FII"));
  const dii = $derived(data.summary.fii_dii.find((f: any) => f.category === "DII"));
  const adv = $derived((b.advances ?? 0) / Math.max(1, (b.advances ?? 0) + (b.declines ?? 0)));
  let tab = $state<"gainers" | "losers" | "active">("gainers");
  const movers = $derived(tab === "gainers" ? data.gainers : tab === "losers" ? data.losers : data.active);
</script>

<svelte:head><title>{BRAND} — Indian stock research</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>Markets</h1>
      <p class="sub">NSE close for {date(b.as_of)} · {TAGLINE}</p>
    </div>
  </div>

  <div class="grid grid-4">
    <div class="card stat">
      <div class="label">Advances / Declines</div>
      <div class="value"><span class="up">{int(b.advances)}</span> / <span class="down">{int(b.declines)}</span></div>
      <div class="breadth" aria-hidden="true"><span style="width: {adv * 100}%"></span></div>
    </div>
    <div class="card stat">
      <div class="label">52-week highs / lows</div>
      <div class="value"><span class="up">{int(b.at_52w_high)}</span> / <span class="down">{int(b.at_52w_low)}</span></div>
    </div>
    <div class="card stat">
      <div class="label">Total turnover</div>
      <div class="value">{cr(b.turnover_cr)}</div>
    </div>
    <a class="card stat" href="/fii-dii">
      <div class="label">FII / DII net {fii ? `· ${date(fii.date)}` : ""}</div>
      {#if fii || dii}
        <div class="value"><span class={tone(fii?.net_value)}>{cr(fii?.net_value)}</span> / <span class={tone(dii?.net_value)}>{cr(dii?.net_value)}</span></div>
      {:else}
        <div class="value muted">Not loaded</div>
      {/if}
    </a>
  </div>

  <div class="insights">
    <a class="card insight" href="/heatmap"><b>Heatmap</b><span class="sub">Every sector at a glance</span></a>
    <a class="card insight" href="/signals"><b>Signals</b><span class="sub">Breakouts, crosses, RSI, volume spikes</span></a>
    <a class="card insight" href="/valuations"><b>Valuations</b><span class="sub">Nifty P/E, P/B and yield history</span></a>
    <a class="card insight" href="/deliveries"><b>Deliveries</b><span class="sub">Where buyers took delivery</span></a>
    <div class="card insight">
      <b>F&amp;O ban {data.foBan ? `· ${date(data.foBan.date)}` : ""}</b>
      <span class="sub">
        {#if data.foBan?.symbols.length}
          {#each data.foBan.symbols as s, i}<a href="/stock/{s}">{s}</a>{i < data.foBan.symbols.length - 1 ? ", " : ""}{/each}
        {:else}None{/if}
      </span>
    </div>
  </div>

  <div class="grid grid-2">
    <section class="card">
      <div class="card-head">
        <h2>Movers</h2>
        <div class="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "gainers"} class:active={tab === "gainers"} onclick={() => (tab = "gainers")}>Gainers</button>
          <button role="tab" aria-selected={tab === "losers"} class:active={tab === "losers"} onclick={() => (tab = "losers")}>Losers</button>
          <button role="tab" aria-selected={tab === "active"} class:active={tab === "active"} onclick={() => (tab = "active")}>Most active</button>
        </div>
      </div>
      <StockTable rows={movers} cols={["close", "change_pct", "turnover"]} />
      <p class="foot">Stocks with at least ₹1 Cr turnover.</p>
    </section>

    <section class="card">
      <div class="card-head"><h2>Sectors</h2><a class="sub" href="/sectors">All sectors →</a></div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Sector</th><th>Stocks</th><th>Avg day</th><th>Avg 1M</th><th>Turnover</th></tr></thead>
          <tbody>
            {#each data.sectors.slice(0, 10) as s}
              <tr>
                <td><a href="/sectors/{encodeURIComponent(s.sector)}">{s.sector}</a></td>
                <td>{s.stocks}</td>
                <td class={tone(s.avg_change_pct)}>{pct(s.avg_change_pct)}</td>
                <td class={tone(s.avg_ret_1m)}>{pct(s.avg_ret_1m)}</td>
                <td>{crore(s.turnover)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  </div>
</div>

<style>
  a.card { color: inherit; }
  .insights { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
  .insight { padding: 12px 14px; display: grid; gap: 2px; font-size: 14px; }
  .insight .sub { font-size: 12.5px; }
  @media (max-width: 900px) { .insights { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  a.card:hover { border-color: var(--brand-2); }
  .muted { color: var(--ink-3); font-size: 16px; }
  .breadth { margin-top: 8px; height: 6px; border-radius: 3px; background: var(--down-soft); overflow: hidden; }
  .breadth span { display: block; height: 100%; background: var(--up); }
  .foot { padding: 10px 16px; color: var(--ink-3); font-size: 12.5px; border-top: 1px solid var(--line); }
</style>
