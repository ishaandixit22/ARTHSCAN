<script lang="ts">
  // What analysts say, shown as theirs: the rating mix today and how it has shifted over three months.
  let { analysts, loading }: { analysts: any | null; loading: boolean } = $props();
  const RATINGS = [
    { key: "Strong Buy", color: "#0d6537" },
    { key: "Buy", color: "#3f9b68" },
    { key: "Hold", color: "#8a8a86" },
    { key: "Sell", color: "#d0584a" },
    { key: "Strong Sell", color: "#8c1a10" },
  ];
  const a = $derived(analysts);
  const leading = $derived(a ? RATINGS.reduce((best, r) => ((a.latest[r.key] ?? 0) > (a.latest[best.key] ?? 0) ? r : best), RATINGS[0]) : null);
  const totalOf = (counts: Record<string, number>) => RATINGS.reduce((n, r) => n + (counts[r.key] ?? 0), 0);
  const tallest = $derived(a ? Math.max(1, ...a.trend.map((t: any) => totalOf(t.counts))) : 1);
</script>

{#if a}
  <div class="fc">
    <section aria-label="Analyst ratings today">
      <h3>Rating from {a.total} analyst{a.total === 1 ? "" : "s"}</h3>
      <div class="now">
        <div class="verdict" style="--c: {leading?.color}"><span>Most common</span><b>{leading?.key}</b></div>
        <div class="bars">
          {#each RATINGS as r}
            {@const n = a.latest[r.key] ?? 0}
            <div class="row">
              <span class="name">{r.key}</span>
              <div class="track"><i style="width: {(n / a.total) * 100}%; background: {r.color}"></i></div>
              <b>{Math.round((n / a.total) * 100)}%</b>
            </div>
          {/each}
        </div>
      </div>
    </section>
    <section aria-label="How the consensus has moved">
      <h3>Consensus over three months</h3>
      <div class="stacks" role="img" aria-label="Analyst ratings at five points over the last three months">
        {#each a.trend as t}
          {@const total = totalOf(t.counts)}
          <div class="stack">
            <b>{total}</b>
            <div class="column" style="height: {(total / tallest) * 150}px">
              {#each RATINGS as r}
                {@const n = t.counts[r.key] ?? 0}
                {#if n}<i style="flex: {n}; background: {r.color}">{n}</i>{/if}
              {/each}
            </div>
            <span>{t.label}</span>
          </div>
        {/each}
      </div>
      <div class="key">
        {#each RATINGS as r}<span><i style="background: {r.color}"></i>{r.key}</span>{/each}
      </div>
    </section>
    <p class="note">Ratings published by brokerage analysts, gathered by Indian Stock API. They are the analysts' opinions, not Arthscan's and not advice.</p>
  </div>
{:else}
  <div class="empty">{loading ? "Loading analyst ratings…" : "No analyst ratings for this stock."}</div>
{/if}

<style>
  .fc { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 24px 44px; }
  .note { grid-column: 1 / -1; margin: 0; color: var(--ink-3); font-size: 12.5px; line-height: 1.5; }
  h3 { margin: 0 0 12px; padding-top: 8px; border-top: var(--rule-heavy); font: 800 18px var(--display); font-stretch: 78%; }
  .now { display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 20px; align-items: center; }
  .verdict { display: grid; gap: 2px; padding: 14px 12px; text-align: center; background: color-mix(in srgb, var(--c) 12%, transparent); border-top: 4px solid var(--c); }
  .verdict span { color: var(--ink-3); font-size: 12px; }
  .verdict b { font: 800 22px/1.1 var(--display); font-stretch: 74%; color: var(--ink); }
  .bars { display: grid; gap: 8px; }
  .row { display: grid; grid-template-columns: 78px minmax(0, 1fr) 38px; gap: 10px; align-items: center; font-size: 13.5px; font-variant-numeric: tabular-nums; }
  .row b { text-align: right; font-weight: 600; }
  .name { color: var(--ink-2); }
  .track { height: 10px; background: var(--panel-2); }
  .track i { display: block; height: 100%; }
  .stacks { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; align-items: end; }
  .stack { display: grid; gap: 4px; justify-items: center; text-align: center; font-size: 12px; }
  .stack > b { font-size: 13px; font-variant-numeric: tabular-nums; }
  .stack > span { color: var(--ink-3); line-height: 1.2; }
  .column { display: flex; flex-direction: column; width: 100%; max-width: 56px; gap: 1px; }
  .column i { display: flex; align-items: center; justify-content: center; min-height: 1px; overflow: hidden; color: #fff; font-size: 11px; font-style: normal; font-weight: 700; }
  .key { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 10px; font-size: 12px; color: var(--ink-2); }
  .key i { display: inline-block; width: 9px; height: 9px; margin-right: 4px; }
  @media (max-width: 860px) { .fc { grid-template-columns: minmax(0, 1fr); } .now { grid-template-columns: 104px minmax(0, 1fr); } }
</style>
