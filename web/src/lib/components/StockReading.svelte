<script lang="ts">
  // The coloured reading under a stock's name: four findings columns, then the pass mark, the trend
  // and one sentence. Opening a column lists every finding in it, with the figures behind each.
  import type { readStock } from "$lib/stock-reading";

  let { reading }: { reading: ReturnType<typeof readStock> } = $props();

  const COLUMNS = [
    { key: "strengths", label: "Strengths", tone: "s" },
    { key: "weaknesses", label: "Weaknesses", tone: "w" },
    { key: "opportunities", label: "Opportunities", tone: "o" },
    { key: "threats", label: "Threats", tone: "t" },
  ] as const;
  let open = $state<(typeof COLUMNS)[number]["key"] | "checks" | null>(null);
  const toggle = (key: typeof open) => (open = open === key ? null : key);
  const TREND = { bullish: "Trend is up", bearish: "Trend is down", neutral: "No clear trend" };
  const scoreTone = $derived(reading.score == null ? "" : reading.score >= 60 ? "good" : reading.score >= 40 ? "mid" : "low");
  const openColumn = $derived(COLUMNS.find((c) => c.key === open));
</script>

<section class="reading" aria-label="Reading of this stock's figures">
  <div class="swot">
    {#each COLUMNS as c}
      {@const rows = reading[c.key]}
      <button class="col {c.tone}" aria-expanded={open === c.key} onclick={() => toggle(c.key)}>
        <span class="head">{c.label} <b>{rows.length}</b></span>
        <span class="first">{rows[0]?.title ?? "None found in the figures so far"}</span>
      </button>
    {/each}
  </div>

  {#if openColumn}
    <ul class="list {openColumn.tone}">
      {#each reading[openColumn.key] as f}
        <li><b>{f.title}</b> {f.detail}</li>
      {:else}
        <li>No {openColumn.label.toLowerCase()} show up in the figures we have for this stock.</li>
      {/each}
    </ul>
  {/if}

  <div class="tiles">
    <button class="tile" aria-expanded={open === "checks"} onclick={() => toggle("checks")} disabled={reading.score == null}>
      <span class="name">Essentials</span>
      {#if reading.score != null}
        <span class="meter">
          <i style="left: {reading.score}%"></i>
          <b class={scoreTone} style="left: clamp(28px, {reading.score}%, calc(100% - 28px))">{reading.score}% pass</b>
        </span>
        <small>{reading.passed} of {reading.checks.length} checks</small>
      {:else}
        <small>Too few figures to score yet</small>
      {/if}
    </button>
    <div class="tile">
      <span class="name">Technicals</span>
      {#if reading.trend}
        <span class="trend {reading.trend}">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d={reading.trend === "bullish" ? "M3 17 9 11l4 4 8-9M15 6h6v6" : reading.trend === "bearish" ? "M3 7l6 6 4-4 8 9M15 18h6v-6" : "M3 12h18"} />
          </svg>
          {TREND[reading.trend]}
        </span>
        <small>Moving averages and oscillators, on daily closes</small>
      {:else}
        <small>Not enough price history yet</small>
      {/if}
    </div>
    <div class="tile">
      <span class="name">In a sentence</span>
      <p>{reading.insight ?? "Not enough reported figures for a summary yet."}</p>
    </div>
  </div>

  {#if open === "checks"}
    <ul class="checks">
      {#each reading.checks as c}
        <li class:pass={c.pass}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d={c.pass ? "M5 12l5 5L20 7" : "M6 6l12 12M18 6 6 18"} /></svg>
          <span>{c.label}</span><b>{c.value}</b>
        </li>
      {/each}
    </ul>
  {/if}
  <p class="source">Worked out by Arthscan from the figures on this page, by fixed rules. A description of the data, not advice to buy or sell.</p>
</section>

<style>
  .reading { --s: var(--up); --w: var(--down); --o: var(--series); --t: var(--warn); display: grid; gap: 14px; }
  .swot { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  button { font: inherit; color: inherit; text-align: left; cursor: pointer; background: none; border: 0; padding: 0; }
  button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .col { display: grid; gap: 4px; align-content: start; padding: 10px 12px 12px; border-top: 4px solid var(--c); background: color-mix(in srgb, var(--c) 7%, transparent); transition: background 160ms var(--ease); }
  .col:hover, .col[aria-expanded="true"] { background: color-mix(in srgb, var(--c) 14%, transparent); }
  .s { --c: var(--s); } .w { --c: var(--w); } .o { --c: var(--o); } .t { --c: var(--t); }
  .head { color: var(--c); font: 800 17px var(--display); font-stretch: 78%; }
  .head b { font-weight: 800; font-variant-numeric: tabular-nums; }
  .first { color: var(--ink); font-size: 14px; line-height: 1.35; }
  .list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 28px; margin: 0; padding: 12px 14px; list-style: none; background: color-mix(in srgb, var(--c) 7%, transparent); font-size: 14px; line-height: 1.45; color: var(--ink-2); }
  .list b { display: block; color: var(--c); font-weight: 700; }

  .tiles { display: grid; grid-template-columns: 1fr 1fr 1.2fr; gap: 0; border-top: var(--rule); border-bottom: var(--rule); }
  .tile { display: grid; gap: 6px; align-content: start; padding: 12px 18px 14px; min-width: 0; }
  .tile + .tile { border-left: var(--rule); }
  .tile:first-child { padding-left: 0; }
  button.tile:hover:not(:disabled) { background: var(--panel-2); }
  button.tile:disabled { cursor: default; }
  .name { font: 800 12.5px var(--font); font-stretch: 80%; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-2); }
  small { color: var(--ink-3); font-size: 12.5px; }
  .tile p { margin: 0; font: 15.5px/1.4 var(--serif); color: var(--ink); }

  .meter { position: relative; display: block; height: 34px; margin-top: 2px; }
  .meter::before { content: ""; position: absolute; left: 0; right: 0; bottom: 3px; height: 5px; background: linear-gradient(to right, var(--down), var(--warn), var(--up)); }
  .meter i { position: absolute; bottom: 0; width: 2px; height: 11px; margin-left: -1px; background: var(--ink); }
  .meter b { position: absolute; top: 0; transform: translateX(-50%); padding: 1px 8px; color: #fff; font-size: 12.5px; font-weight: 700; white-space: nowrap; border-radius: var(--radius-s); }
  .meter b.good { background: var(--up); } .meter b.mid { background: var(--warn); } .meter b.low { background: var(--down); }

  .trend { display: inline-flex; gap: 8px; align-items: center; font: 800 21px var(--display); font-stretch: 74%; }
  .trend svg { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .trend.bullish { color: var(--up); } .trend.bearish { color: var(--down); } .trend.neutral { color: var(--ink-2); }

  .checks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 28px; margin: 0; padding: 0; list-style: none; font-size: 14px; }
  .checks li { display: flex; gap: 8px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--line); color: var(--down); }
  .checks li.pass { color: var(--up); }
  .checks svg { flex-shrink: 0; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
  .checks span { color: var(--ink); flex: 1; }
  .checks b { color: var(--ink-2); font-weight: 600; font-variant-numeric: tabular-nums; }
  .source { margin: 0; color: var(--ink-3); font-size: 12.5px; }

  @media (max-width: 900px) {
    .swot { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .tiles { grid-template-columns: 1fr; }
    .tile { padding-left: 0; }
    .tile + .tile { border-left: 0; border-top: var(--rule); }
    .list, .checks { grid-template-columns: 1fr; }
  }
</style>
