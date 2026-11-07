<script lang="ts">
  import { phoneCap } from "$lib/phoneCap";
  import { BRAND } from "$lib/brand";
  import { crore, date, num, pct, price, tone } from "$lib/format";

  let { data } = $props();
  const d = $derived(data.data);
</script>

<svelte:head><title>Top deliveries — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>Deliveries</h1>
      <p class="sub">Share of each stock's traded quantity taken for delivery rather than squared off the same day. Stocks with ≥ ₹5 Cr turnover, {date(d.as_of)}.</p>
    </div>
    <div class="tabs">
      <a href="?sort=deliv_pct" class:active={data.sort === "deliv_pct"} data-sveltekit-noscroll>Highest delivery</a>
      <a href="?sort=deliv_jump" class:active={data.sort === "deliv_jump"} data-sveltekit-noscroll>Biggest jump vs 20D</a>
    </div>
  </div>

  <section class="card">
    <div class="table-scroll">
      <table class="m-cards m-quote m-capped" use:phoneCap={d.results.length}>
        <thead><tr><th>Stock</th><th>Delivery</th><th>20D avg</th><th>Price</th><th class="wide-only">Day</th><th class="wide-only">Vol x</th><th class="wide-only">Turnover</th></tr></thead>
        <tbody>
          {#each d.results as r (r.symbol)}
            <tr>
              <td><a href="/stock/{r.symbol}" class="sym">{r.symbol}</a><span class="name">{r.name}</span></td>
              <td data-label="Delivery"><b>{pct(r.deliv_pct, false)}</b></td>
              <td data-label="20D avg" class={tone(r.deliv_pct_avg_20 != null ? r.deliv_pct - r.deliv_pct_avg_20 : null)}>{pct(r.deliv_pct_avg_20, false)}</td>
              <td data-label="Price">{price(r.close)}</td>
              <td data-label="Day" class="wide-only {tone(r.change_pct)}">{pct(r.change_pct)}</td>
              <td data-label="Vol x" class="wide-only">{num(r.vol_ratio, 1)}</td>
              <td data-label="Turnover" class="wide-only">{crore(r.turnover)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
</div>

<style>
  @media (max-width: 640px) { .wide-only { display: none; } }
</style>
