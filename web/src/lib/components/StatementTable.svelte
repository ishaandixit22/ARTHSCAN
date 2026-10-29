<script lang="ts">
  // One financial statement: line items down the side, periods across, oldest
  // to newest so the latest sits at the right edge (scrolled into view). Key
  // lines carry their growth against the same period a year earlier.
  import { num } from "$lib/format";

  type Row = { label: string; note: string | null; kind: "cr" | "pct" | "days" | "rs"; values: Record<string, number | null> };
  let { periods, rows, growthFor = [], lag = 1 }: { periods: string[]; rows: Row[]; growthFor?: string[]; lag?: number } = $props();

  let scroller: HTMLDivElement | undefined = $state();
  $effect(() => {
    void periods;
    if (scroller) scroller.scrollLeft = scroller.scrollWidth;
  });

  // Totals read as totals: bold, with a rule above.
  const TOTALS = /^(net profit|total assets|total liabilities|net cash flow|operating profit|financing profit|profit before tax)$/i;
  const fmt = (v: number | null | undefined, kind: Row["kind"]) =>
    v == null ? "—" : kind === "pct" ? `${num(v, v % 1 ? 1 : 0)}%` : kind === "days" ? num(v, 0) : kind === "rs" ? num(v, 2) : num(v, 0);
  const growth = (r: Row, i: number) => {
    const p = periods[i], q = periods[i - lag];
    if (!q || p === "TTM") return null;
    const a = r.values[p], b = r.values[q];
    return a == null || b == null || b === 0 ? null : ((a - b) / Math.abs(b)) * 100;
  };
</script>

<div class="table-scroll" bind:this={scroller}>
  <table>
    <thead>
      <tr>
        <th class="item">INR crore</th>
        {#each periods as p, i}<th class:latest={i === periods.length - 1}>{p}</th>{/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as r (r.label)}
        <tr class:total={TOTALS.test(r.label)}>
          <td class="item" title={r.note ?? undefined}>{r.label}{#if r.note}<span class="note"> ⓘ</span>{/if}</td>
          {#each periods as p, i}
            {@const v = r.values[p]}
            <td class:neg={v != null && v < 0 && r.kind === "cr"} class:latest={i === periods.length - 1}>{fmt(v, r.kind)}</td>
          {/each}
        </tr>
        {#if growthFor.includes(r.label)}
          <tr class="growth">
            <td class="item">{lag === 4 ? "Growth vs a year ago" : "Growth"}</td>
            {#each periods as _, i}
              {@const g = growth(r, i)}
              <td class={g == null ? "" : g >= 0 ? "up" : "down"} class:latest={i === periods.length - 1}>{g == null ? "" : `${g > 0 ? "+" : ""}${g.toFixed(1)}%`}</td>
            {/each}
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>
</div>

<style>
  th, td { min-width: 92px; }
  .item { position: sticky; left: 0; z-index: 1; background: var(--panel); min-width: 210px; text-align: left; font-family: var(--font); font-size: 13px; box-shadow: 1px 0 0 var(--line); }
  th.item { z-index: 2; }
  tbody tr:hover .item { background: var(--panel-2); }
  .latest { background: color-mix(in srgb, var(--accent) 6%, transparent); }
  th.latest { color: var(--ink); }
  .total td { font-weight: 600; color: var(--ink); }
  .total td.item { font-weight: 600; }
  .neg, .total td.neg { color: var(--down); }
  .growth td { height: 30px; font-size: 11.5px; color: var(--ink-3); border-bottom-style: dashed; }
  .growth td.item { color: var(--ink-3); font-size: 12px; padding-left: 30px; }
  .note { color: var(--ink-3); cursor: help; }
  @media (max-width: 640px) { .item { min-width: 150px; } th, td { min-width: 80px; } }
</style>
