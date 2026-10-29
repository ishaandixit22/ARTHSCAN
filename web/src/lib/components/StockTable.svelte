<script lang="ts">
  import Logo from "$lib/components/Logo.svelte";
  import { crore, num, pct, price, tone } from "$lib/format";

  type Col = "close" | "change_pct" | "turnover" | "ret_1m" | "ret_1y" | "pct_from_high" | "pe" | "sector" | "ret_3m" | "volatility_1y";
  let { rows, cols = ["close", "change_pct", "turnover"], compact = false, logos = false }: { rows: any[]; cols?: Col[]; compact?: boolean; logos?: boolean } = $props();

  const LABELS: Record<Col, string> = {
    close: "Price", change_pct: "Day", turnover: "Turnover", ret_1m: "1M", ret_3m: "3M", ret_1y: "1Y",
    pct_from_high: "From 52W high", pe: "P/E", sector: "Sector", volatility_1y: "Volatility",
  };
  // Secondary columns that drop out on phones so price and change stay visible.
  const WIDE_ONLY = new Set<Col>(["turnover", "sector", "volatility_1y", "pct_from_high", "ret_3m"]);

  // A column with no data in any row (P/E before fundamentals are loaded) reads as broken; leave it out.
  const shown = $derived(cols.filter((c) => c !== "pe" || rows.some((r) => r.pe != null)));
</script>

{#snippet label(r: any)}
  <a href="/stock/{r.symbol}"><span class="sym">{r.symbol}</span></a>
  {#if r.listed_today}<span class="chip new" title="First trading day: change is measured against the issue price">New</span>{/if}
  {#if !compact}<span class="name">{r.name}</span>{/if}
{/snippet}

<div class="table-scroll">
  <table class:compact>
    <thead>
      <tr>
        <th>Stock</th>
        {#each shown as c}<th class:left={c === "sector"} class:wide-only={WIDE_ONLY.has(c)}>{LABELS[c]}</th>{/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as r (r.symbol)}
        <tr>
          <td>
            {#if logos}
              <div class="stk">
                <Logo isin={r.isin} symbol={r.symbol} size={32} />
                <div class="txt">{@render label(r)}</div>
              </div>
            {:else}
              {@render label(r)}
            {/if}
          </td>
          {#each shown as c}
            {#if c === "close"}<td>{price(r.close)}</td>
            {:else if c === "turnover"}<td class="wide-only">{crore(r.turnover)}</td>
            {:else if c === "pe"}<td>{num(r.pe, 1)}</td>
            {:else if c === "volatility_1y"}<td class="wide-only">{pct(r.volatility_1y, false)}</td>
            {:else if c === "sector"}<td class="left sector wide-only">{r.sector ?? "—"}</td>
            {:else if c === "change_pct" && r.listed_today}<td class="muted" title="vs issue price">{pct(r[c])}*</td>
            {:else}<td class="{tone(r[c])}" class:wide-only={WIDE_ONLY.has(c)}>{pct(r[c])}</td>
            {/if}
          {/each}
        </tr>
      {:else}
        <tr><td colspan={shown.length + 1} class="empty">No stocks match.</td></tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .compact td, .compact th { padding: 7px 12px; }
  .sector { color: var(--ink-3); font-size: 13px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
  .new { margin-left: 6px; font-size: 11px; padding: 1px 6px; background: var(--brand-soft); color: var(--brand); }
  .muted { color: var(--ink-3); }
  /* Logo beside a two-line label: the logo never shares a line with the name. */
  .stk { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .txt { min-width: 0; display: grid; justify-items: start; }
  @media (max-width: 640px) {
    .wide-only { display: none; }
    /* With a logo the stock column is wider; keep the name from running into the price. */
    .stk .name { max-width: 92px; }
  }
</style>
