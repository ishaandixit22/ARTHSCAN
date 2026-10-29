<script lang="ts">
  import { BRAND } from "$lib/brand";
  import LiveBadge from "$lib/components/LiveBadge.svelte";
  import { compact, num, pct, price, tone } from "$lib/format";
  import { live, tradeTime, watch } from "$lib/live.svelte";

  let { data } = $props();
  $effect(() => watch(data.stocks.map((s) => s.symbol)));

  // Briefly tint a row when its price moves.
  let flash = $state<Record<string, "up" | "down">>({});
  let last: Record<string, number> = {};
  $effect(() => {
    for (const s of data.stocks) {
      const q = live.quotes[s.symbol];
      if (!q) continue;
      const prev = last[s.symbol];
      if (prev !== undefined && q.ltp !== prev) {
        flash[s.symbol] = q.ltp > prev ? "up" : "down";
        setTimeout(() => delete flash[s.symbol], 700);
      }
      last[s.symbol] = q.ltp;
    }
  });
  const ticking = $derived(data.stocks.filter((s) => live.quotes[s.symbol]).length);
</script>

<svelte:head><title>Live — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>Live <LiveBadge /></h1>
      <p class="sub">The 50 most traded NSE stocks, updating as trades happen. {ticking} of {data.stocks.length} receiving prices.</p>
    </div>
  </div>

  {#if live.status && (live.status.state === "error" || live.status.state === "not_configured")}
    <div class="notice">{live.status.message}. Prices below are yesterday's close.</div>
  {/if}

  <section class="card">
    <div class="table-scroll">
      <table>
        <thead><tr><th>Stock</th><th>Price</th><th>Change</th><th class="wide-only">High</th><th class="wide-only">Low</th><th class="wide-only">Volume</th><th class="wide-only">Last trade</th></tr></thead>
        <tbody>
          {#each data.stocks as s (s.symbol)}
            {@const q = live.quotes[s.symbol]}
            <tr class={flash[s.symbol] ? `flash-${flash[s.symbol]}` : ""}>
              <td><a href="/stock/{s.symbol}" class="sym">{s.symbol}</a><span class="name">{s.name}</span></td>
              <td>{price(q?.ltp ?? s.close)}</td>
              <td class={tone(q?.changePct ?? null)}>{q ? `${q.change != null && q.change > 0 ? "+" : ""}${num(q.change)} (${pct(q.changePct)})` : "—"}</td>
              <td class="wide-only">{num(q?.high)}</td>
              <td class="wide-only">{num(q?.low)}</td>
              <td class="wide-only">{compact(q?.volume)}</td>
              <td class="wide-only mono">{tradeTime(q?.ltt ?? null)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
  <p class="sub small">Live prices from your Dhan Data API subscription, visible only to accounts with live access.</p>
</div>

<style>
  h1 { display: flex; align-items: center; gap: 10px; }
  tr { transition: background-color 0.6s; }
  .flash-up { background: var(--up-soft); }
  .flash-down { background: var(--down-soft); }
  .small { font-size: 12.5px; }
  @media (max-width: 640px) { .wide-only { display: none; } }
  @media (prefers-reduced-motion: reduce) { tr { transition: none; } }
</style>
