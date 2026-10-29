<script lang="ts">
  // Signed flows (INR crore) over time: bars above/below a zero line, or a
  // running line. One measure per chart — the cumulative view is a second chart,
  // never a second axis. Hover or focus shows the exact value.
  import { crSigned } from "$lib/format";

  type Point = { label: string; value: number | null; note?: string };
  let { points, kind = "bars", height = 220, label }: { points: Point[]; kind?: "bars" | "line"; height?: number; label: string } = $props();

  let width = $state(600);
  let hover = $state<number | null>(null);
  const pad = { top: 12, right: 8, bottom: 22, left: 64 };

  const vals = $derived(points.map((p) => p.value ?? 0));
  const lo = $derived(Math.min(0, ...vals));
  const hi = $derived(Math.max(0, ...vals));
  const span = $derived(hi - lo || 1);
  const plotW = $derived(Math.max(10, width - pad.left - pad.right));
  const plotH = $derived(height - pad.top - pad.bottom);
  const y = (v: number) => pad.top + ((hi - v) / span) * plotH;
  const step = $derived(plotW / Math.max(1, points.length));
  const x = (i: number) => pad.left + step * i + step / 2;
  const barW = $derived(Math.max(1, Math.min(28, step - 2)));

  // Three or four round gridline values.
  const ticks = $derived.by(() => {
    const raw = span / 4;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const inc = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
    const out: number[] = [];
    for (let v = Math.ceil(lo / inc) * inc; v <= hi + 1e-9; v += inc) out.push(Math.round(v));
    return out;
  });
  const short = (v: number) => (Math.abs(v) >= 1e5 ? `${(v / 1e5).toFixed(1)}L` : Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v));

  // About six x labels whatever the length.
  const every = $derived(Math.max(1, Math.ceil(points.length / 6)));
  const linePath = $derived(points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value ?? 0).toFixed(1)}`).join(""));

  function move(e: PointerEvent) {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const i = Math.floor((e.clientX - r.left - pad.left) / step);
    hover = i >= 0 && i < points.length ? i : null;
  }
  const tip = $derived(hover === null ? null : points[hover]);
</script>

<div class="flow" bind:clientWidth={width}>
  <svg {width} {height} role="img" aria-label={label} onpointermove={move} onpointerleave={() => (hover = null)}>
    {#each ticks as t}
      <line class="grid" class:zero={t === 0} x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} />
      <text class="axis" x={pad.left - 8} y={y(t) + 4} text-anchor="end">{short(t)}</text>
    {/each}
    {#if kind === "bars"}
      {#each points as p, i}
        {#if p.value}
          {@const top = p.value > 0 ? y(p.value) : y(0)}
          {@const h = Math.max(1, Math.abs(y(p.value) - y(0)))}
          <path
            class="bar {p.value > 0 ? 'pos' : 'neg'}"
            class:dim={hover !== null && hover !== i}
            d={roundedBar(x(i) - barW / 2, top, barW, h, p.value > 0)}
          />
        {/if}
      {/each}
    {:else}
      <path class="line" d={linePath} />
      {#if hover !== null}<circle class="dot" cx={x(hover)} cy={y(points[hover].value ?? 0)} r="4" />{/if}
    {/if}
    {#if hover !== null}<line class="cross" x1={x(hover)} x2={x(hover)} y1={pad.top} y2={height - pad.bottom} />{/if}
    {#each points as p, i}
      {#if i % every === 0}<text class="axis" x={x(i)} y={height - 6} text-anchor="middle">{p.label}</text>{/if}
    {/each}
  </svg>
  {#if tip}
    <div class="tip" style="left: {Math.min(width - 150, Math.max(0, x(hover!) - 75))}px">
      <b>{tip.note ?? tip.label}</b>
      <span class={tip.value == null ? "" : tip.value > 0 ? "up" : tip.value < 0 ? "down" : ""}>{crSigned(tip.value)}</span>
    </div>
  {/if}
</div>

<script module lang="ts">
  /** A bar with its data end (away from zero) rounded 3px and the baseline end square. */
  function roundedBar(x: number, y: number, w: number, h: number, up: boolean) {
    const r = Math.min(3, w / 2, h);
    return up
      ? `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
      : `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
  }
</script>

<style>
  .flow { position: relative; width: 100%; }
  svg { display: block; touch-action: pan-y; }
  .grid { stroke: var(--line); stroke-width: 1; }
  .grid.zero { stroke: var(--line-2); }
  .axis { fill: var(--ink-3); font-size: 11px; font-variant-numeric: tabular-nums; }
  .bar.pos { fill: var(--up); }
  .bar.neg { fill: var(--down); }
  .bar.dim { opacity: 0.45; }
  .line { fill: none; stroke: var(--brand-2); stroke-width: 2; stroke-linejoin: round; }
  .dot { fill: var(--brand-2); stroke: var(--panel); stroke-width: 2; }
  .cross { stroke: var(--ink-3); stroke-dasharray: 3 3; stroke-width: 1; }
  .tip {
    position: absolute; top: 0; width: 150px; pointer-events: none; display: grid; gap: 2px;
    background: var(--panel); border: 1px solid var(--line-2); border-radius: 6px; padding: 6px 8px;
    font-size: 12px; box-shadow: 0 2px 8px rgb(0 0 0 / 0.12); font-variant-numeric: tabular-nums;
  }
  .tip b { font-weight: 600; color: var(--ink-2); }
</style>
