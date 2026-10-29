<script lang="ts">
  import { BRAND } from "$lib/brand";
  import { crore, date, num, pct, price, tone } from "$lib/format";

  let { data } = $props();
  const d = $derived(data.data);
</script>

<svelte:head><title>Technical signals — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>Signals</h1>
      <p class="sub">Stocks with ≥ ₹1 Cr turnover showing a technical signal at the close of {date(d.as_of)}. Indicators use split-adjusted prices.</p>
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
      <table>
        <thead><tr><th>Stock</th><th>Price</th><th>Day</th><th>RSI</th><th class="wide-only">MACD hist</th><th class="wide-only">Vol x</th><th class="wide-only">Delivery</th><th class="wide-only">Turnover</th></tr></thead>
        <tbody>
          {#each d.results as r (r.symbol)}
            <tr>
              <td><a href="/stock/{r.symbol}" class="sym">{r.symbol}</a>{#if r.cross_date}<span class="chip tiny">{date(r.cross_date)}</span>{/if}<span class="name">{r.name}</span></td>
              <td>{price(r.close)}</td>
              <td class={tone(r.change_pct)}>{pct(r.change_pct)}</td>
              <td>{num(r.rsi_14, 1)}</td>
              <td class="wide-only {tone(r.macd_hist)}">{num(r.macd_hist)}</td>
              <td class="wide-only">{num(r.vol_ratio, 1)}</td>
              <td class="wide-only">{pct(r.deliv_pct, false)}</td>
              <td class="wide-only">{crore(r.turnover)}</td>
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
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chips .chip { padding: 6px 12px; font-size: 13px; border: 1px solid var(--line); background: var(--panel); }
  .chips .chip.on { background: var(--brand); color: var(--panel); border-color: var(--brand); }
  .tiny { margin-left: 6px; font-size: 11px; padding: 1px 6px; }
  .small { font-size: 12.5px; }
  @media (max-width: 640px) { .wide-only { display: none; } }
</style>
