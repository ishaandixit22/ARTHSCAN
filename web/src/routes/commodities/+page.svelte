<script lang="ts">
  import { BRAND } from "$lib/brand";
  import { fetchedAt, num, pct, tone } from "$lib/format";

  let { data } = $props();
  type Row = { product: string; expiry: string; last_traded_price: string; change: number; per_change: number; high_price: string; low_price: string; open_interest: string; price_quotation_unit: string; quotation_lot: string; last_traded_time: string; oiResult?: string };
  // Each product's nearest expiry is the contract people quote.
  const near = $derived.by(() => {
    const seen = new Map<string, Row>();
    for (const r of (data.c.data ?? []) as Row[]) {
      const cur = seen.get(r.product);
      if (!cur || Date.parse(r.expiry) < Date.parse(cur.expiry)) seen.set(r.product, r);
    }
    return [...seen.values()].sort((a, b) => a.product.localeCompare(b.product));
  });
  const n = (v: string | number | null | undefined) => (v == null || v === "" ? null : Number(v));
</script>

<svelte:head><title>Commodities — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>Commodities</h1>
      <p class="sub">MCX futures, nearest expiry for each contract: precious and base metals, energy.{#if data.c.fetched_at}{" "}Fetched {fetchedAt(data.c.fetched_at)}.{/if}</p>
    </div>
  </div>

  {#if data.c.error}
    <div class="notice">{data.c.error}</div>
  {:else}
    <section class="card">
      <div class="table-scroll">
        <table>
          <thead><tr><th>Contract</th><th>Last price</th><th>Change</th><th class="wide-only">Day range</th><th class="wide-only">Open interest</th><th class="left wide-only">Unit</th></tr></thead>
          <tbody>
            {#each near as r (r.product)}
              <tr>
                <td><span class="sym">{r.product}</span><span class="name">expires {r.expiry}</span></td>
                <td>₹{num(n(r.last_traded_price))}</td>
                <td class={tone(r.change)}>{r.change > 0 ? "+" : ""}{num(r.change)} ({pct(r.per_change)})</td>
                <td class="wide-only">{num(n(r.low_price))} – {num(n(r.high_price))}</td>
                <td class="wide-only">{num(n(r.open_interest), 0)}{#if r.oiResult}<span class="name">{r.oiResult}</span>{/if}</td>
                <td class="left wide-only">per {r.quotation_lot} {r.price_quotation_unit?.toLowerCase()}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
    <p class="sub small">Source: Indian Stock API (MCX). Prices in INR.</p>
  {/if}
</div>

<style>
  .small { font-size: 12.5px; }
  @media (max-width: 640px) { .wide-only { display: none; } }
</style>
