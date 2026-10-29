<script lang="ts">
  // "● Live · 14:32:05" while live market data is showing; otherwise the page's
  // end-of-day wording (passed as `close`).
  import { market } from "$lib/liveMarket.svelte";

  let { close }: { close: string } = $props();
  const time = $derived(
    market.updatedAt ? new Date(market.updatedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }) : "",
  );
</script>

{#if market.data}<span class="stamp" title="Dhan live prices, refreshed every 15 seconds"><i></i>Live · {time} IST</span>{:else}{close}{/if}

<style>
  .stamp { display: inline-flex; align-items: center; gap: 5px; color: var(--up); font-weight: 500; }
  i { width: 6px; height: 6px; border-radius: 50%; background: var(--up); }
</style>
