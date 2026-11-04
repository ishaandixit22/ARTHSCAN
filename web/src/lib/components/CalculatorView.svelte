<script lang="ts">
  // Draws any calculator from its inputs and Result: inputs on the left, the answer on the right,
  // then the tables. Everything recomputes in the browser and nothing is sent anywhere.
  import { untrack } from "svelte";
  import { CALCULATORS, defaults, rs, type Calculator, type Field } from "$lib/calculators/engine";
  import CalculatorChart from "./CalculatorChart.svelte";
  import CalculatorField from "./CalculatorField.svelte";

  let { slug }: { slug: string } = $props();

  // The page wraps this in a {#key}, so each calculator gets a fresh copy with its own starting values.
  const calc: Calculator = untrack(() => CALCULATORS[slug]);
  let values = $state(defaults(calc));
  const result = $derived(calc.compute(values));
  const splitTotal = $derived((result.split ?? []).reduce((s, x) => s + x.value, 0));
</script>

<div class="calc">
  <form class="inputs" aria-label="Your numbers" onsubmit={(e) => e.preventDefault()}>
    {#each calc.inputs as input (input.key)}
      {#if input.kind === "choice"}
        <div class="choice">
          <label for="calc-{input.key}">{input.label}</label>
          <select id="calc-{input.key}" bind:value={values[input.key]}>
            {#each input.options as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
          </select>
          {#if input.hint}<p class="hint">{input.hint}</p>{/if}
        </div>
      {:else}
        <CalculatorField input={input as Field} bind:value={values[input.key] as number} />
      {/if}
    {/each}
  </form>

  <div class="answer" aria-live="polite">
    <p class="head-label">{result.headline.label}</p>
    <p class="head-value">{result.headline.value}</p>
    {#if result.warn}<p class="notice warn">{result.warn}</p>{/if}

    {#if result.stats.length}
      <dl class="stats">
        {#each result.stats as s (s.label)}<div><dt>{s.label}</dt><dd>{s.value}</dd></div>{/each}
      </dl>
    {/if}

    {#if result.split && splitTotal > 0}
      <div class="split" role="img" aria-label={result.split.map((p) => `${p.label} ${rs(p.value)}`).join(", ")}>
        {#each result.split as p (p.label)}
          {#if p.value > 0}<span class={p.tone} style="flex-grow: {p.value}"></span>{/if}
        {/each}
      </div>
      <ul class="split-key">
        {#each result.split as p (p.label)}
          <li><i class={p.tone}></i>{p.label}<b>{rs(p.value)}</b><em>{((p.value / splitTotal) * 100).toFixed(0)}%</em></li>
        {/each}
      </ul>
    {/if}

    {#if result.chart}
      <CalculatorChart title={result.chart.title} labels={result.chart.labels} series={result.chart.series} />
    {/if}
  </div>
</div>

{#each result.tables ?? [] as t (t.title)}
  <section class="card">
    <div class="card-head"><h2>{t.title}</h2></div>
    <div class="table-scroll">
      <table>
        <thead><tr>{#each t.columns as c, i (i)}<th scope="col">{c}</th>{/each}</tr></thead>
        <tbody>
          {#each t.rows as row, r (r)}
            <tr class:total={row[0] === "Total tax"}>{#each row as cell, i (i)}<td>{cell}</td>{/each}</tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{/each}

<style>
  .calc { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 40px; align-items: start; border-top: var(--rule-heavy); }
  .inputs { display: grid; align-content: start; }
  .answer { display: grid; gap: 18px; padding-top: 14px; min-width: 0; position: sticky; top: 60px; }

  .choice { display: grid; gap: 6px; padding: 12px 0; border-bottom: 1px solid var(--line); }
  .choice label { font-size: 14.5px; font-weight: 600; font-stretch: 88%; }
  .choice select { width: 100%; min-width: 0; text-overflow: ellipsis; }
  .hint { font: 13px/1.4 var(--serif); color: var(--ink-3); }

  .head-label { font-size: 12.5px; font-weight: 800; font-stretch: 75%; text-transform: uppercase; letter-spacing: 0.07em; color: var(--ink-2); }
  .head-value { margin-top: -14px; font: 850 clamp(42px, 5.4vw, 72px)/1 var(--display); font-stretch: 62%; letter-spacing: -0.01em; overflow-wrap: anywhere; }
  .warn { font: 14.5px/1.45 var(--serif); }

  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); margin: 0; border-top: 1px solid var(--ink); border-bottom: var(--rule); }
  .stats div { padding: 10px 14px 12px 0; }
  dt { font-size: 12px; font-weight: 700; font-stretch: 80%; line-height: 1.3; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-2); }
  dd { margin: 4px 0 0; font: 800 22px/1.1 var(--display); font-stretch: 70%; overflow-wrap: anywhere; }

  .split { display: flex; gap: 2px; height: 14px; }
  .split span { flex: 1 1 0; min-width: 2px; }
  .base { --c: #8c8c87; }
  .gain { --c: var(--series); }
  :global(:root[data-theme="dark"]) .base { --c: #6a6a67; }
  .split span, i { background: var(--c); }
  .split-key { display: flex; flex-wrap: wrap; gap: 4px 24px; list-style: none; margin: -10px 0 0; padding: 0; font-size: 14px; color: var(--ink-2); }
  .split-key li { display: inline-flex; align-items: center; gap: 7px; }
  i { width: 10px; height: 10px; flex: none; }
  .split-key b { color: var(--ink); font-weight: 750; font-stretch: 85%; }
  .split-key em { font-style: normal; color: var(--ink-3); font-stretch: 85%; }

  tr.total td { font-weight: 800; border-top: 1.5px solid var(--ink); }

  @media (max-width: 860px) {
    .calc { grid-template-columns: minmax(0, 1fr); gap: 20px; }
    .answer { position: static; border-top: var(--rule-heavy); }
    .head-value { font-size: 52px; }
  }
</style>
