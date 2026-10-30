<script lang="ts">
  // Dhan's company snapshot, read for a beginner: each ratio next to its industry's
  // average, what the ratio means, and which way big investors moved last quarter.
  import { num } from "$lib/format";

  type Info = {
    overview: Record<string, number | string | null>;
    ratios: Record<string, number | null>;
    shareholding: Record<string, number | string | null>;
  };
  let { info, industry }: { info: Info; industry: string | null } = $props();

  const r = $derived(info.ratios);
  const o = $derived(info.overview);
  const sh = $derived(info.shareholding);
  const group = $derived((o.industry as string | null) ?? industry ?? "its industry");

  type Row = { label: string; value: number; avg: number; unit: string; means: string; low: string; high: string };
  type MaybeRow = Omit<Row, "value" | "avg"> & { value: number | null; avg: number | null };
  const rows = $derived(
    (<MaybeRow[]>[
      { label: "Price to book", value: r.pb, avg: r.industry_pb, unit: "x", means: "What you pay for each ₹1 of the company's net assets.", low: "cheaper than", high: "pricier than" },
      { label: "Debt to equity", value: r.debt_to_equity, avg: r.industry_debt_to_equity, unit: "x", means: "Borrowed money for each ₹1 the owners have put in. Higher means more fixed interest to pay.", low: "less borrowed than", high: "more borrowed than" },
      { label: "Dividend yield", value: o.dividend_yield as number | null, avg: r.industry_dividend_yield, unit: "%", means: "Cash paid out each year as dividends, as a share of today's price.", low: "pays less than", high: "pays more than" },
    ]).filter((x): x is Row => x.value != null && x.avg != null),
  );

  const fmt = (v: number, unit: string) => (unit === "%" ? `${num(v, 2)}%` : `${num(v, 2)}${unit}`);
  // Within 5% of the average reads as "in line".
  const verdict = (x: Row) => (Math.abs(x.value - x.avg) <= Math.abs(x.avg) * 0.05 ? "in line with" : x.value < x.avg ? x.low : x.high);
  const width = (v: number, x: Row) => `${Math.max(2, (Math.abs(v) / Math.max(Math.abs(x.value), Math.abs(x.avg), 1e-9)) * 100)}%`;

  const quarter = $derived.by(() => {
    const p = String(sh.period ?? "");
    if (!/^\d{6}$/.test(p)) return null;
    return new Date(Date.UTC(+p.slice(0, 4), +p.slice(4) - 1, 1)).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
  });
  const move = (v: number | string | null) => (typeof v === "number" ? `${v > 0 ? "+" : ""}${num(v, 2)} pts` : "—");
  const tone = (v: number | string | null) => (typeof v === "number" ? (v > 0 ? "up" : v < 0 ? "down" : "") : "");
</script>

<section class="card">
  <div class="card-head"><h2>Against its industry</h2><span class="sub">{group} · from Dhan</span></div>

  {#if r.pe != null || r.roe != null || r.roce != null}
    <div class="quick">
      {#if r.pe != null}
        <div>
          <span class="k">P/E</span><b>{num(r.pe, 1)}</b>
          <span class="means">{#if r.pe_to_sector_pe != null}{num(r.pe_to_sector_pe, 2)}× the sector's average P/E. {r.pe_to_sector_pe < 1 ? "The market pays less for each ₹1 of its profit than for its peers'." : "The market pays more for each ₹1 of its profit than for its peers'."}{:else}Price for each ₹1 of yearly profit.{/if}</span>
        </div>
      {/if}
      {#if r.roe != null}
        <div><span class="k">ROE</span><b>{num(r.roe, 1)}%</b><span class="means">Profit made on each ₹100 the owners have in the business.</span></div>
      {/if}
      {#if r.roce != null}
        <div><span class="k">ROCE</span><b>{num(r.roce, 1)}%</b><span class="means">Operating profit on each ₹100 of all money used, borrowed or owned.</span></div>
      {/if}
    </div>
  {/if}

  {#if rows.length}
    <ul class="vs">
      {#each rows as x}
        <li>
          <div class="head">
            <span class="k">{x.label}</span>
            <span class="say">{verdict(x)} the industry</span>
          </div>
          <div class="bars">
            <span class="name">This stock</span><span class="track"><i class="me" style="width: {width(x.value, x)}"></i></span><b>{fmt(x.value, x.unit)}</b>
            <span class="name">Industry avg</span><span class="track"><i style="width: {width(x.avg, x)}"></i></span><b class="muted">{fmt(x.avg, x.unit)}</b>
          </div>
          <p class="means">{x.means}</p>
        </li>
      {/each}
    </ul>
  {/if}

  {#if sh.fii != null || sh.dii != null}
    <div class="flows">
      <span class="k">Big investors{quarter ? `, ${quarter} quarter` : ""}</span>
      <span>Foreign (FII) hold <b>{num(sh.fii as number, 2)}%</b> <em class={tone(sh.fii_change)}>{move(sh.fii_change)}</em></span>
      <span>Domestic funds (DII) hold <b>{num(sh.dii as number, 2)}%</b> <em class={tone(sh.dii_change)}>{move(sh.dii_change)}</em></span>
      <p class="means">The change is against the quarter before. A rise means these institutions bought more of the company's shares.</p>
    </div>
  {/if}
</section>

<style>
  .k { font-size: 12px; color: var(--ink-3); }
  .means { margin: 4px 0 0; font-size: 12.5px; color: var(--ink-3); line-height: 1.45; }
  .quick { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; padding: 4px 18px 18px; }
  .quick div { display: flex; flex-direction: column; }
  .quick b { font-family: var(--font); font-size: 22px; font-weight: 500; margin-top: 2px; }
  .vs { list-style: none; margin: 0; padding: 0; }
  .vs li { padding: 16px 18px; border-top: 1px solid var(--line); }
  .head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .say { font-size: 13px; color: var(--ink-2); }
  .bars { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 6px 12px; margin-top: 10px; }
  .name { font-size: 12px; color: var(--ink-3); min-width: 84px; }
  .track { height: 8px; background: var(--panel-2); overflow: hidden; }
  .track i { display: block; height: 100%; background: var(--ink-3); opacity: 0.55; transition: width 0.6s var(--ease); }
  .track i.me { background: var(--brand); opacity: 1; }
  .bars b { font-family: var(--font); font-size: 13px; font-weight: 500; text-align: right; min-width: 64px; }
  .bars b.muted { color: var(--ink-3); }
  .flows { display: flex; flex-wrap: wrap; gap: 6px 22px; align-items: baseline; padding: 16px 18px; border-top: 1px solid var(--line); font-size: 14px; }
  .flows .k { flex-basis: 100%; }
  .flows em { font-style: normal; font-family: var(--font); font-size: 12.5px; margin-left: 4px; }
  .flows .means { flex-basis: 100%; }
  @media (max-width: 640px) {
    .quick { grid-template-columns: 1fr; gap: 14px; }
  }
</style>
