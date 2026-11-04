<script lang="ts">
  // Seasonality: how the stock has done in this calendar month in past years, the same for all
  // twelve months, and every year laid out as a heat table.
  import { pct, tone } from "$lib/format";

  let { stats, name, loading }: { stats: any | null; name: string; loading: boolean } = $props();
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const months = $derived((stats?.seasonality?.months ?? []) as any[]);
  const nowIndex = new Date(Date.now() + 19800_000).getUTCMonth();
  const now = $derived(months[nowIndex]);
  const years = $derived(Object.keys(stats?.seasonality?.by_year ?? {}).sort().reverse());
  let showYears = $state(false);

  /** Green or red, stronger the further from zero. Tops out at 20%. */
  function shade(v: number | null | undefined) {
    if (v == null) return "transparent";
    const strength = Math.min(1, Math.abs(v) / 20);
    return `color-mix(in srgb, var(--${v >= 0 ? "up" : "down"}) ${Math.round(8 + strength * 42)}%, transparent)`;
  }
</script>

{#if months.some((x) => x.years > 0)}
  <div class="season">
    {#if now?.years}
      <p class="lead"><b>{now.positive}</b> out of <b>{now.years}</b> years, <b>{name}</b> has given positive returns in <b>{FULL[nowIndex]}</b>.</p>
    {/if}
    <div class="table-scroll">
      <table>
        <thead>
          <tr><th class="left">Month</th><th>Up years</th><th>Biggest rise</th><th>Avg rise</th><th>Biggest fall</th><th>Avg fall</th><th>Avg change</th></tr>
        </thead>
        <tbody>
          {#each months as x, i}
            <tr class:now={i === nowIndex}>
              <th class="left" scope="row">{x.month}</th>
              <td>{x.years ? `${x.positive} of ${x.years}` : "—"}</td>
              <td class="up">{x.max_positive ? pct(x.max_positive.pct) : "—"}{#if x.max_positive}<small>{x.max_positive.year}</small>{/if}</td>
              <td class="up">{pct(x.avg_positive)}</td>
              <td class="down">{x.max_negative ? pct(x.max_negative.pct) : "—"}{#if x.max_negative}<small>{x.max_negative.year}</small>{/if}</td>
              <td class="down">{pct(x.avg_negative)}</td>
              <td style="background: {shade(x.avg_change)}"><b class={tone(x.avg_change)}>{pct(x.avg_change)}</b></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <button class="btn small" aria-expanded={showYears} onclick={() => (showYears = !showYears)}>{showYears ? "Hide" : "Show"} every year</button>
    {#if showYears}
      <div class="table-scroll">
        <table class="heat">
          <thead><tr><th class="left">Year</th>{#each MONTHS as m}<th>{m}</th>{/each}</tr></thead>
          <tbody>
            {#each years as y}
              <tr>
                <th class="left" scope="row">{y}</th>
                {#each stats.seasonality.by_year[y] as v}
                  <td style="background: {shade(v)}">{v == null ? "" : v.toFixed(1)}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
    <p class="note">Close of one month to the close of the next, adjusted for splits and bonuses, from Dhan's history for this stock. A pattern in past years doesn't say what this year will do.</p>
  </div>
{:else}
  <div class="empty">{loading ? "Working out seasonality…" : "Not enough price history for seasonality yet."}</div>
{/if}

<style>
  .season { display: grid; gap: 14px; justify-items: start; }
  .season > :not(.btn) { width: 100%; }
  .lead { margin: 0; font: 19px/1.4 var(--serif); }
  .lead b { font-family: var(--font); font-weight: 800; }
  table { width: 100%; font-variant-numeric: tabular-nums; }
  th.left { text-align: left; }
  tbody th { border-bottom: 1px solid var(--line); }
  tr.now th, tr.now td { font-weight: 800; box-shadow: inset 0 -2px 0 var(--ink); }
  small { margin-left: 5px; color: var(--ink-3); font-size: 11.5px; font-weight: 500; }
  .heat { font-size: 12.5px; }
  .heat td, .heat th { padding: 4px 6px; text-align: center; }
  .heat th.left { text-align: left; }
  .note { margin: 0; color: var(--ink-3); font-size: 12.5px; line-height: 1.5; max-width: 80ch; }
</style>
