<script lang="ts">
  import { near } from "$lib/near";
  import { theme } from "$lib/theme.svelte";

  let { symbol }: { symbol: string } = $props();

  const LOADER = "https://widgets.tradingview-widget.com/w/en/tv-advanced-chart.js";
  let show = $state(false);

  // Loaded only as the chart nears the screen. The loader registers <tv-advanced-chart> once;
  // moving between stocks reuses it.
  function load() {
    show = true;
    if (document.querySelector(`script[src="${LOADER}"]`)) return;
    const s = document.createElement("script");
    s.type = "module";
    s.src = LOADER;
    document.head.append(s);
  }
</script>

<div class="tv" use:near={load}>
  {#if show}
    <!-- Rebuilt for each stock and theme, because the widget reads these when it starts. -->
    {#key `${symbol}|${theme.current}`}
      <tv-advanced-chart {symbol} theme={theme.current}></tv-advanced-chart>
    {/key}
  {/if}
</div>

<style>
  /* Height is set before the widget loads, so the page below doesn't jump. */
  .tv { height: 600px; }
  .tv :global(tv-advanced-chart) { display: block; width: 100%; height: 100%; }
  @media (max-width: 767px) {
    .tv { height: 460px; }
  }
</style>
