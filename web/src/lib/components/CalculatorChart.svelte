<script lang="ts">
  // Stacked yearly bars for a calculator: what you paid in, and what it earned. The year-by-year
  // table under it carries the same numbers for anyone who can't read the chart.
  import { rs, type Tone } from "$lib/calculators/engine";

  type Series = { name: string; tone: Tone; values: number[] };
  let { title, labels, series }: { title: string; labels: string[]; series: Series[] } = $props();

  let width = $state(640);
  let hover = $state<number | null>(null);
  const height = 260;
  const pad = { top: 12, right: 0, bottom: 24, left: 54 };

  const totals = $derived(labels.map((_, i) => series.reduce((s, x) => s + x.values[i], 0)));
  const peak = $derived(Math.max(1, ...totals));
  // Round tick steps: 1, 2 or 5 times a power of ten, about four ticks to the top.
  const step = $derived.by(() => {
    const raw = peak / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    return [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  });
  const top = $derived(Math.ceil(peak / step) * step);
  const ticks = $derived(Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step));
  const plotW = $derived(Math.max(10, width - pad.left - pad.right));
  const plotH = height - pad.top - pad.bottom;
  const band = $derived(plotW / labels.length);
  const barW = $derived(Math.max(3, Math.min(band - 2, 44)));
  const y = (v: number) => pad.top + plotH - (v / top) * plotH;
  const short = (v: number) => {
    if (v >= 1e7) return `₹${+(v / 1e7).toFixed(2)} Cr`;
    if (v >= 1e5) return `₹${+(v / 1e5).toFixed(1)} L`;
    if (v >= 1e3) return `₹${+(v / 1e3).toFixed(0)}k`;
    return `₹${Math.round(v)}`;
  };
  // Year labels thin out so they never touch.
  const every = $derived(Math.max(1, Math.ceil(36 / band)));
  const showLabel = (i: number) => (labels.length - 1 - i) % every === 0;
  const tipLeft = $derived(hover == null ? 0 : Math.min(Math.max(pad.left + band * hover + band / 2, 90), width - 90));
</script>

<figure class="chart" bind:clientWidth={width}>
  <figcaption>
    <span class="title">{title}</span>
    {#if series.length > 1}
      <span class="legend">
        {#each series as s (s.name)}<span class="key"><i class={s.tone}></i>{s.name}</span>{/each}
      </span>
    {/if}
  </figcaption>
  <div class="plot">
    <svg {width} {height} role="img" aria-label="{title}. The table below gives the same figures." onmouseleave={() => (hover = null)}>
      {#each ticks as t (t)}
        <line class="grid" x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} />
        <text class="tick" x={pad.left - 8} y={y(t) + 4} text-anchor="end">{short(t)}</text>
      {/each}
      {#each labels as label, i (label)}
        {@const x = pad.left + band * i + (band - barW) / 2}
        {@const stacked = series.reduce<{ tone: Tone; base: number; v: number }[]>((acc, s) => {
          const base = acc.length ? acc[acc.length - 1].base + acc[acc.length - 1].v : 0;
          acc.push({ tone: s.tone, base, v: s.values[i] });
          return acc;
        }, [])}
        {#each stacked as seg, j (j)}
          {#if seg.v > 0}
            <rect class="bar {seg.tone}" class:dim={hover != null && hover !== i} {x} y={y(seg.base + seg.v)} width={barW} height={Math.max(0, y(seg.base) - y(seg.base + seg.v))} stroke="var(--bg)" stroke-width="1" />
          {/if}
        {/each}
        {#if showLabel(i)}<text class="tick" x={pad.left + band * i + band / 2} y={height - 6} text-anchor="middle">{i + 1}</text>{/if}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <rect class="hit" x={pad.left + band * i} y={pad.top} width={band} height={plotH} onmouseenter={() => (hover = i)} />
      {/each}
    </svg>
    {#if hover != null}
      <div class="tip" style="left: {tipLeft}px">
        <b>{labels[hover]}</b>
        {#each series as s (s.name)}<span><i class={s.tone}></i>{s.name}<em>{rs(s.values[hover])}</em></span>{/each}
        {#if series.length > 1}<span class="sum">Total<em>{rs(totals[hover])}</em></span>{/if}
      </div>
    {/if}
  </div>
</figure>

<style>
  .chart { margin: 0; min-width: 0; }
  figcaption { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 6px 16px; margin-bottom: 8px; }
  .title { font: 800 13px var(--font); font-stretch: 75%; text-transform: uppercase; letter-spacing: 0.05em; }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13px; color: var(--ink-2); }
  .key { display: inline-flex; align-items: center; gap: 6px; }
  i { display: inline-block; width: 10px; height: 10px; flex: none; }
  .base { --c: #8c8c87; }
  .gain { --c: var(--series); }
  :global(:root[data-theme="dark"]) .base { --c: #6a6a67; }
  i.base, i.gain { background: var(--c); }
  .plot { position: relative; }
  svg { display: block; }
  .grid { stroke: var(--line); }
  .tick { font: 500 11.5px var(--font); font-stretch: 85%; fill: var(--ink-3); }
  .bar { fill: var(--c); transition: opacity 0.12s var(--ease); }
  .bar.dim { opacity: 0.45; }
  .hit { fill: transparent; }
  .tip {
    position: absolute; top: 4px; transform: translateX(-50%); z-index: 2; pointer-events: none; min-width: 170px;
    display: grid; gap: 3px; padding: 8px 10px; background: var(--bg); box-shadow: var(--float); font-size: 12.5px;
  }
  .tip b { font-weight: 800; font-stretch: 80%; }
  .tip span { display: flex; align-items: center; gap: 6px; color: var(--ink-2); }
  .tip em { margin-left: auto; padding-left: 12px; font-style: normal; font-weight: 700; color: var(--ink); }
  .tip .sum { border-top: 1px solid var(--line-2); padding-top: 3px; }
</style>
