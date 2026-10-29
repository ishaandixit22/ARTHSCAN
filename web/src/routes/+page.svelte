<script lang="ts">
  import StockTable from "$lib/components/StockTable.svelte";
  import { BRAND, TAGLINE } from "$lib/brand";
  import LiveStamp from "$lib/components/LiveStamp.svelte";
  import { banWhen, cr, crore, date, int, pct, tone } from "$lib/format";
  import { market, useLiveMarket, type LiveStock } from "$lib/liveMarket.svelte";

  let { data } = $props();
  // Accounts with live access see breadth and movers from live prices; everyone else the last close.
  $effect(() => (data.live ? useLiveMarket() : undefined));
  const lm = $derived(data.live ? market.data : null);
  const asRows = (xs: LiveStock[]) =>
    xs.slice(0, 8).map((s) => ({ symbol: s.symbol, name: s.name, close: s.ltp, change_pct: s.change_pct, turnover: s.turnover }));
  const b = $derived(lm ? lm.breadth : (data.summary.breadth ?? {}));
  const fii = $derived(data.summary.fii_dii.find((f: any) => f.category === "FII"));
  const dii = $derived(data.summary.fii_dii.find((f: any) => f.category === "DII"));
  const adv = $derived((b.advances ?? 0) / Math.max(1, (b.advances ?? 0) + (b.declines ?? 0)));
  let tab = $state<"gainers" | "losers" | "active">("gainers");
  const movers = $derived(lm ? asRows(lm.movers[tab]) : tab === "gainers" ? data.gainers : tab === "losers" ? data.losers : data.active);
</script>

<svelte:head><title>{BRAND} — Indian stock research</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>Market overview</h1>
      <p class="sub"><LiveStamp close="NSE close for {date(data.summary.breadth?.as_of)}" /> · {TAGLINE}</p>
    </div>
    <p class="ban">
      <a class="label" href="/fo-ban">In F&amp;O ban {banWhen(data.foBan?.date)}</a>:
      {#if data.foBan?.symbols.length}
        {#each data.foBan.symbols as s, i}<a href="/stock/{s}">{s}</a>{i < data.foBan.symbols.length - 1 ? ", " : ""}{/each}
      {:else}none{/if}
    </p>
  </div>

  <div class="grid grid-4">
    <div class="card stat">
      <a class="label" href="/breadth">Advances / Declines →</a>
      <div class="value"><a class="up" href="/breadth?show=advances" title="See the advancing stocks">{int(b.advances)}</a> / <a class="down" href="/breadth?show=declines" title="See the declining stocks">{int(b.declines)}</a></div>
      <div class="breadth" aria-hidden="true"><span style="width: {adv * 100}%"></span></div>
      <div class="sub">of {int(lm ? lm.stocks : b.stocks)} NSE stocks</div>
    </div>
    <div class="card stat">
      <a class="label" href="/breadth?show=highs">52-week highs / lows →</a>
      <div class="value"><a class="up" href="/breadth?show=highs" title="See the stocks at a 52-week high">{int(b.at_52w_high)}</a> / <a class="down" href="/breadth?show=lows" title="See the stocks at a 52-week low">{int(b.at_52w_low)}</a></div>
      <div class="sub">at a new 52-week high / low</div>
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
  .ban { font-size: 13px; color: var(--ink-3); }
  .ban a { color: var(--ink); font-family: var(--mono); font-size: 12.5px; }
  .ban a:hover { color: var(--brand-2); }
  .ban a.label { font-family: var(--font); font-size: 13px; color: var(--ink-3); }
  a.card:hover { border-color: var(--brand-2); }
  .muted { color: var(--ink-3); font-size: 16px; }
  .stat a.label:hover { color: var(--brand-2); }
  .stat .value a { text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 4px; text-decoration-color: color-mix(in srgb, currentColor 35%, transparent); }
  .stat .value a:hover { text-decoration-color: currentColor; }
  .breadth { margin-top: 10px; height: 3px; border-radius: 2px; background: var(--down); overflow: hidden; }
  .breadth span { display: block; height: 100%; background: var(--up); }
  .foot { padding: 12px 18px; color: var(--ink-3); font-size: 12px; border-top: 1px solid var(--line); }
</style>
