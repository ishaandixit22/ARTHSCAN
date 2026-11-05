<script lang="ts">
  import { phoneCap } from "$lib/phoneCap";
  import { BRAND } from "$lib/brand";
  import LiveStamp from "$lib/components/LiveStamp.svelte";
  import { crore, date, num, pct, price, tone } from "$lib/format";
  import { market, useLiveMarket } from "$lib/liveMarket.svelte";

  let { data } = $props();
  // Volume spikes and 52-week breakouts mean something mid-session, so live accounts
  // see them from live prices. RSI, MACD and moving-average crosses are defined on
  // closing prices and always come from the last close.
  const LIVE_DEFS: Record<string, string> = {
    volume_spike: "Volume so far today at least 3x the 20-session average",
    breakout_high: "Trading above its 52-week high",
    breakout_low: "Trading below its 52-week low",
  };
  const liveCapable = $derived(!!data.live && data.signal in LIVE_DEFS);
  $effect(() => (liveCapable ? useLiveMarket({ signals: true }) : undefined));
  const lm = $derived(liveCapable ? market.data : null);
  const d = $derived.by(() => {
    if (!lm) return data.data;
    const rows = lm.signals[data.signal as keyof typeof lm.signals].map((s) => ({
      symbol: s.symbol, name: s.name, close: s.ltp, change_pct: s.change_pct, rsi_14: null, macd_hist: null,
      vol_ratio: s.vol_ratio, deliv_pct: null, turnover: s.turnover, cross_date: null,
    }));
    return { ...data.data, results: rows, definition: LIVE_DEFS[data.signal] };
  });
</script>

<svelte:head><title>Technical signals — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>Signals</h1>
      <p class="sub">
        Stocks with ≥ ₹1 Cr turnover showing a technical signal.
        {#if lm}<LiveStamp close="" /> — RSI, MACD and delivery stay at the close of {date(data.data.as_of)}.
        {:else}At the close of {date(d.as_of)}{liveCapable ? "" : data.live ? " (this signal is defined on closing prices)" : ""}. Indicators use split-adjusted prices.{/if}
      </p>
    </div>
  </div>

  <nav class="chips" aria-label="Signal">
    {#each data.signals as [key, label]}
      <a href="?signal={key}" class="chip" class:on={key === data.signal} data-sveltekit-noscroll>{label}</a>
    {/each}
  </nav>

  <section class="card">
    <div class="card-head"><h2>{d.results.length} stocks</h2><span class="sub">{d.definition}</span></div>
    <div class="table-scroll">
      <table class="m-cards m-quote m-capped" use:phoneCap={d.results.length}>
        <thead><tr><th>Stock</th><th>Price</th><th>Day</th><th>RSI</th><th class="wide-only">MACD hist</th><th class="wide-only">Vol x</th><th class="wide-only">Delivery</th><th class="wide-only">Turnover</th></tr></thead>
        <tbody>
          {#each d.results as r (r.symbol)}
            <tr>
              <td><a href="/stock/{r.symbol}" class="sym">{r.symbol}</a>{#if r.cross_date}<span class="chip tiny">{date(r.cross_date)}</span>{/if}<span class="name">{r.name}</span></td>
              <td data-label="Price">{price(r.close)}</td>
              <td class={tone(r.change_pct)} data-label="Day">{pct(r.change_pct)}</td>
              <td data-label="RSI">{num(r.rsi_14, 1)}</td>
              <td class="wide-only {tone(r.macd_hist)}" data-label="MACD hist">{num(r.macd_hist)}</td>
              <td class="wide-only" data-label="Vol x">{num(r.vol_ratio, 1)}</td>
              <td class="wide-only" data-label="Delivery">{pct(r.deliv_pct, false)}</td>
              <td class="wide-only m-hide" data-label="Turnover">{crore(r.turnover)}</td>
            </tr>
          {:else}
            <tr><td colspan="8" class="empty">No stocks show this signal today.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
  <p class="sub small">Signals describe what prices did; they are not recommendations.</p>
</div>

<style>
  .chips { display: flex; flex-wrap: wrap; gap: 4px 22px; border-bottom: 1px solid var(--line); }
  .chips .chip { position: relative; padding: 8px 0; font-size: 13px; font-weight: 500; background: none; border-radius: 0; color: var(--ink-3); }
  .chips .chip:hover { color: var(--ink); }
  .chips .chip.on { color: var(--ink); }
  .chips .chip.on::after { content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 1px; background: var(--accent); }
  .tiny { margin-left: 6px; font-size: 11px; padding: 1px 6px; }
  .small { font-size: 12.5px; }
  @media (max-width: 640px) {
    .wide-only { display: none; }
    .chips { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin-right: -16px; padding-right: 16px; }
    .chips .chip { flex: none; padding: 11px 0; }
  }
</style>
