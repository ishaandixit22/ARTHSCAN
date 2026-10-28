<script lang="ts">
  import StockTable from "$lib/components/StockTable.svelte";
  import { BRAND } from "$lib/brand";

  let { data } = $props();
</script>

<svelte:head><title>{data.sector} stocks — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <p class="sub"><a href="/sectors">Sectors</a> /</p>
      <h1>{data.sector}</h1>
      <p class="sub">{data.rows.length} stocks, most traded first</p>
    </div>
    <a class="btn small" href="/screener?sector={encodeURIComponent(data.sector)}">Screen this sector</a>
  </div>
  <section class="card">
    <StockTable rows={data.rows} cols={["close", "change_pct", "ret_1m", "ret_1y", "pct_from_high", "pe", "turnover"]} />
  </section>
</div>
