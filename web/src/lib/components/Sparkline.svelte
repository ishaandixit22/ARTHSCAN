<script lang="ts">
  // A small line of recent values (e.g. eight quarters of profit): green when
  // the latest is above the first, red below, with a dotted zero line when the
  // values cross into losses. Hover shows each point's value.
  // `rising` overrides the colour (e.g. green when profit is up on a year ago, whatever the eight-quarter shape).
  let { values, labels = [], width = 76, height = 24, rising }: { values: (number | null)[]; labels?: string[]; width?: number; height?: number; rising?: boolean } = $props();

  const pts = $derived(values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null));
  const min = $derived(Math.min(...pts.map((p) => p.v)));
  const max = $derived(Math.max(...pts.map((p) => p.v)));
  const span = $derived(max - min || 1);
  const x = (i: number) => (values.length > 1 ? (i / (values.length - 1)) * (width - 4) + 2 : width / 2);
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4);
  const up = $derived(rising ?? (pts.length > 1 && pts[pts.length - 1].v >= pts[0].v));
  const crossesZero = $derived(min < 0 && max > 0);
  const title = $derived(pts.map((p) => `${labels[p.i] ?? ""} ${Math.round(p.v).toLocaleString("en-IN")}`.trim()).join(" · "));
</script>

{#if pts.length > 1}
  <svg {width} {height} viewBox="0 0 {width} {height}" role="img" aria-label="Trend: {title}">
    <title>{title}</title>
    {#if crossesZero}<line class="zero" x1="0" x2={width} y1={y(0)} y2={y(0)} />{/if}
    <polyline class:up class:down={!up} points={pts.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ")} />
    <circle class:up class:down={!up} cx={x(pts[pts.length - 1].i)} cy={y(pts[pts.length - 1].v)} r="2" />
  </svg>
{:else}
  <span class="none">—</span>
{/if}

<style>
  svg { display: block; overflow: visible; }
  polyline { fill: none; stroke-width: 1.5; stroke-linejoin: round; stroke-linecap: round; }
  polyline.up { stroke: var(--up); }
  polyline.down { stroke: var(--down); }
  circle.up { fill: var(--up); }
  circle.down { fill: var(--down); }
  .zero { stroke: var(--ink-3); stroke-width: 1; stroke-dasharray: 2 2; opacity: 0.6; }
  .none { color: var(--ink-3); }
</style>
