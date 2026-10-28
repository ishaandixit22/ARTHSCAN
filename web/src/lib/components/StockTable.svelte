<script lang="ts">
  import { crore, num, pct, price, tone } from "$lib/format";

  type Col = "close" | "change_pct" | "turnover" | "ret_1m" | "ret_1y" | "pct_from_high" | "pe" | "sector" | "ret_3m" | "volatility_1y";
  let { rows, cols = ["close", "change_pct", "turnover"], compact = false }: { rows: any[]; cols?: Col[]; compact?: boolean } = $props();

  const LABELS: Record<Col, string> = {
    close: "Price", change_pct: "Day", turnover: "Turnover", ret_1m: "1M", ret_3m: "3M", ret_1y: "1Y",
    pct_from_high: "From 52W high", pe: "P/E", sector: "Sector", volatility_1y: "Volatility",
  };
</script>

<div class="table-scroll">
  <table class:compact>
    <thead>
      <tr>
        <th>Stock</th>
        {#each cols as c}<th class:left={c === "sector"}>{LABELS[c]}</th>{/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as r (r.symbol)}
        <tr>
          <td>
            <a href="/stock/{r.symbol}"><span class="sym">{r.symbol}</span></a>
            {#if !compact}<span class="name">{r.name}</span>{/if}
          </td>
          {#each cols as c}
            {#if c === "close"}<td>{price(r.close)}</td>
            {:else if c === "turnover"}<td>{crore(r.turnover)}</td>
            {:else if c === "pe"}<td>{num(r.pe, 1)}</td>
            {:else if c === "volatility_1y"}<td>{pct(r.volatility_1y, false)}</td>
            {:else if c === "sector"}<td class="left sector">{r.sector ?? "—"}</td>
            {:else}<td class={tone(r[c])}>{pct(r[c])}</td>
            {/if}
          {/each}
        </tr>
      {:else}
        <tr><td colspan={cols.length + 1} class="empty">No stocks match.</td></tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .compact td, .compact th { padding: 7px 12px; }
  .sector { color: var(--ink-3); font-size: 13px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
</style>
