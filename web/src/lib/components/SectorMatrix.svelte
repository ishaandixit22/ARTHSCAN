<script lang="ts" module>
  export type MatrixSector = {
    key: string; name: string; x: number; y: number; dx: number; dy: number; quadrant: "tr" | "br" | "bl" | "tl"; size: number;
    tail: { date: string; x: number; y: number }[];
  };
  type Placed = { id: string; lx: number; ly: number; anchor: "start" | "end" | "middle"; leader: boolean };

  /** Greedy label placement: crowded dots first, each label tries a ring of positions and takes the least overlapping one. */
  export function placeLabels(items: { id: string; x: number; y: number; w: number; r: number }[], W: number, H: number): Map<string, Placed> {
    const H_LABEL = 13;
    const rects: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const dots = items.map((i) => ({ id: i.id, x0: i.x - i.r - 2, y0: i.y - i.r - 2, x1: i.x + i.r + 2, y1: i.y + i.r + 2 }));
    const overlap = (a: { x0: number; y0: number; x1: number; y1: number }, b: { x0: number; y0: number; x1: number; y1: number }) =>
      Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    const crowd = (i: (typeof items)[number]) => items.filter((o) => o !== i && Math.hypot(o.x - i.x, o.y - i.y) < 48).length;
    const out = new Map<string, Placed>();
    for (const it of [...items].sort((a, b) => crowd(b) - crowd(a))) {
      const g = it.r + 4;
      // [dx, dy, anchor]: near the dot first, then further out (these get a leader line).
      const ring: [number, number, Placed["anchor"]][] = [
        [g, 4, "start"], [-g, 4, "end"], [0, -g - 2, "middle"], [0, g + 11, "middle"], [g, -g, "start"], [-g, -g, "end"], [g, g + 8, "start"], [-g, g + 8, "end"],
        [g + 18, -16, "start"], [-g - 18, -16, "end"], [g + 18, 22, "start"], [-g - 18, 22, "end"], [0, -g - 24, "middle"], [0, g + 32, "middle"],
        [g + 40, 4, "start"], [-g - 40, 4, "end"],
      ];
      let best: { cost: number; p: Placed; rect: (typeof rects)[number] } | null = null;
      for (const [dx, dy, anchor] of ring) {
        const x0 = anchor === "start" ? it.x + dx : anchor === "end" ? it.x + dx - it.w : it.x + dx - it.w / 2;
        const rect = { x0, y0: it.y + dy - H_LABEL + 3, x1: x0 + it.w, y1: it.y + dy + 3 };
        let cost = Math.hypot(dx, dy) * 0.25;
        for (const r of rects) cost += overlap(rect, r) * 6;
        for (const d of dots) if (d.id !== it.id) cost += overlap(rect, d) * 4;
        // Running off the plot is worse than overlapping a neighbour: weigh it by how far it overshoots.
        const over = Math.max(0, 2 - rect.x0) + Math.max(0, rect.x1 - (W - 2)) + Math.max(0, 2 - rect.y0) + Math.max(0, rect.y1 - (H - 2));
        if (over > 0) cost += 20000 + over * 400;
        if (!best || cost < best.cost) best = { cost, p: { id: it.id, lx: it.x + dx, ly: it.y + dy, anchor, leader: Math.hypot(dx, dy) > g + 12 }, rect };
      }
      rects.push(best!.rect);
      out.set(it.id, best!.p);
    }
    return out;
  }

  /** Round tick values covering [lo, hi]. */
  export function ticks(lo: number, hi: number): number[] {
    const span = hi - lo;
    const raw = span / 5;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
    const out: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  }
</script>

<script lang="ts">
  // The rotation map: sectors as dots on a 100-centred plane, coloured by quadrant,
  // with 8-period tails on hover (or for all), zoom, and collision-aware labels.
  let {
    sectors, quadrantNames, xLabel, yLabel, visible, hoverKey = $bindable<string | null>(null), pinned = $bindable<string | null>(null),
    allTails, sized, period,
  }: {
    sectors: MatrixSector[]; quadrantNames: Record<"tr" | "br" | "bl" | "tl", string>; xLabel: string; yLabel: string;
    visible: Set<string>; hoverKey?: string | null; pinned?: string | null; allTails: boolean; sized: boolean; period: string;
  } = $props();

  let width = $state(900);
  let zoom = $state(1);
  const height = $derived(width < 640 ? 440 : 560);
  const m = { l: 54, r: 14, t: 14, b: 44 };
  const shown = $derived(sectors.filter((s) => visible.has(s.key)));

  // Domain: symmetric around the (100, 100) crosshair, wide enough for every visible tail, narrowed by zoom.
  const span = (axis: "x" | "y") => Math.max(2, ...shown.flatMap((s) => s.tail.map((t) => Math.abs(t[axis] - 100)))) * 1.18;
  const rx = $derived(span("x") / zoom), ry = $derived(span("y") / zoom);
  const px = (v: number) => m.l + ((v - (100 - rx)) / (2 * rx)) * (width - m.l - m.r);
  const py = (v: number) => m.t + (1 - (v - (100 - ry)) / (2 * ry)) * (height - m.t - m.b);
  const radius = (s: MatrixSector) => (sized ? 4 + s.size * 8 : 5);

  const inView = (s: MatrixSector) => Math.abs(s.x - 100) <= rx && Math.abs(s.y - 100) <= ry;
  const labels = $derived(placeLabels(
    shown.filter(inView).map((s) => ({ id: s.key, x: px(s.x), y: py(s.y), w: s.name.length * 6.1 + 4, r: radius(s) })), width, height,
  ));
  const COLOUR = { tr: "var(--up)", br: "var(--warn)", bl: "var(--down)", tl: "var(--brand-2)" } as const;
  const focus = $derived(hoverKey ?? pinned);
  const tailOf = (s: MatrixSector) => s.tail.map((t) => `${px(t.x).toFixed(1)},${py(t.y).toFixed(1)}`).join(" ");
  const fmtDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
</script>

<div class="wrap" bind:clientWidth={width}>
  <svg {width} {height} role="img" aria-label="Sector rotation map: {xLabel} against {yLabel}">
    <!-- Quadrants -->
    {#each [["tl", m.l, m.t], ["tr", px(100), m.t], ["bl", m.l, py(100)], ["br", px(100), py(100)]] as [q, x0, y0] (q)}
      {@const x1 = q === "tl" || q === "bl" ? px(100) : width - m.r}
      {@const y1 = q === "tl" || q === "tr" ? py(100) : height - m.b}
      <rect x={Math.max(m.l, Math.min(x0 as number, width - m.r))} y={Math.max(m.t, Math.min(y0 as number, height - m.b))}
        width={Math.max(0, Math.min(x1, width - m.r) - Math.max(m.l, x0 as number))} height={Math.max(0, Math.min(y1, height - m.b) - Math.max(m.t, y0 as number))}
        class="quad {q}" />
    {/each}
    <!-- Grid and axes -->
    {#each ticks(100 - rx, 100 + rx) as t (t)}
      <line class="grid" x1={px(t)} x2={px(t)} y1={m.t} y2={height - m.b} />
      <text class="tick" x={px(t)} y={height - m.b + 16} text-anchor="middle">{t}</text>
    {/each}
    {#each ticks(100 - ry, 100 + ry) as t (t)}
      <line class="grid" x1={m.l} x2={width - m.r} y1={py(t)} y2={py(t)} />
      <text class="tick" x={m.l - 8} y={py(t) + 4} text-anchor="end">{t}</text>
    {/each}
    <line class="cross" x1={px(100)} x2={px(100)} y1={m.t} y2={height - m.b} />
    <line class="cross" x1={m.l} x2={width - m.r} y1={py(100)} y2={py(100)} />
    <text class="axis" x={width < 640 ? m.l : (m.l + width - m.r) / 2} y={height - 6} text-anchor={width < 640 ? "start" : "middle"}>{xLabel} →</text>
    <text class="axis" transform="translate(12 {(m.t + height - m.b) / 2}) rotate(-90)" text-anchor="middle">{yLabel} →</text>

    <!-- Quadrant badges -->
    <text class="badge tl" x={m.l + 8} y={m.t + 16}>{quadrantNames.tl}</text>
    <text class="badge tr" x={width - m.r - 8} y={m.t + 16} text-anchor="end">{quadrantNames.tr}</text>
    <text class="badge bl" x={m.l + 8} y={height - m.b - 8}>{quadrantNames.bl}</text>
    <text class="badge br" x={width - m.r - 8} y={height - m.b - 8} text-anchor="end">{quadrantNames.br}</text>

    <!-- Tails -->
    {#each shown as s (s.key)}
      {#if allTails || focus === s.key}
        <polyline class="tail" class:dim={!focus && allTails} points={tailOf(s)} stroke={COLOUR[s.quadrant]} />
        {#each s.tail.slice(0, -1) as t, i (t.date)}
          <circle class="tailpt" cx={px(t.x)} cy={py(t.y)} r={1.5 + (i / s.tail.length) * 1.8} fill={COLOUR[s.quadrant]} class:dim={!focus && allTails}>
            <title>{s.name}, {fmtDate(t.date)}: {t.x.toFixed(2)}, {t.y.toFixed(2)}</title>
          </circle>
        {/each}
      {/if}
    {/each}

    <!-- Leader lines, dots, labels -->
    {#each shown.filter(inView) as s (s.key)}
      {@const l = labels.get(s.key)}
      {#if l?.leader}<line class="leader" x1={px(s.x)} y1={py(s.y)} x2={l.lx} y2={l.ly - 4} />{/if}
    {/each}
    {#each shown.filter(inView) as s (s.key)}
      {@const l = labels.get(s.key)}
      <g class="node" class:faded={focus && focus !== s.key} class:on={focus === s.key}
        onpointerenter={() => (hoverKey = s.key)} onpointerleave={() => (hoverKey = null)}
        onclick={() => (pinned = pinned === s.key ? null : s.key)} onkeydown={(e) => (e.key === "Enter" || e.key === " ") && (pinned = pinned === s.key ? null : s.key)}
        role="button" tabindex="0" aria-label="{s.name}: {s.x.toFixed(2)}, {s.y.toFixed(2)}, {quadrantNames[s.quadrant]}">
        <circle cx={px(s.x)} cy={py(s.y)} r={radius(s) + 7} fill="transparent" />
        <circle class="dot" cx={px(s.x)} cy={py(s.y)} r={radius(s)} fill={COLOUR[s.quadrant]} />
        {#if l}<text class="label" x={l.lx} y={l.ly} text-anchor={l.anchor}>{s.name}</text>{/if}
        <title>{s.name} · {quadrantNames[s.quadrant]} · {xLabel} {s.x.toFixed(2)}, {yLabel} {s.y.toFixed(2)} · change over 4 {period}s: {s.dx > 0 ? "+" : ""}{s.dx.toFixed(2)}, {s.dy > 0 ? "+" : ""}{s.dy.toFixed(2)}</title>
      </g>
    {/each}
  </svg>

  <div class="zoom" role="group" aria-label="Zoom">
    <button type="button" onclick={() => (zoom = Math.min(8, zoom * 1.5))} aria-label="Zoom in" disabled={zoom >= 8}>+</button>
    <button type="button" onclick={() => (zoom = Math.max(1, zoom / 1.5))} aria-label="Zoom out" disabled={zoom <= 1}>−</button>
    {#if zoom > 1}<button type="button" class="reset" onclick={() => (zoom = 1)}>Reset</button>{/if}
  </div>
</div>

<style>
  .wrap { position: relative; width: 100%; }
  svg { display: block; }
  .quad.tr { fill: color-mix(in srgb, var(--up) 9%, transparent); }
  .quad.br { fill: color-mix(in srgb, var(--warn) 9%, transparent); }
  .quad.bl { fill: color-mix(in srgb, var(--down) 9%, transparent); }
  .quad.tl { fill: color-mix(in srgb, var(--brand-2) 9%, transparent); }
  .grid { stroke: var(--line); stroke-width: 1; }
  .cross { stroke: var(--ink-3); stroke-width: 1; opacity: 0.55; }
  .tick { fill: var(--ink-3); font: 11px var(--mono); }
  .axis { fill: var(--ink-3); font-size: 12px; }
  .badge { font-size: 12px; font-weight: 600; opacity: 0.9; }
  .badge.tr { fill: var(--up); } .badge.br { fill: var(--warn); } .badge.bl { fill: var(--down); } .badge.tl { fill: var(--brand-2); }
  .tail { fill: none; stroke-width: 1.6; stroke-linejoin: round; stroke-linecap: round; opacity: 0.85; }
  .tail.dim, .tailpt.dim { opacity: 0.35; }
  .tailpt { opacity: 0.8; }
  .leader { stroke: var(--ink-3); stroke-width: 1; opacity: 0.7; }
  .node { cursor: pointer; outline: none; }
  .node .dot { stroke: var(--panel); stroke-width: 1.5; transition: opacity 0.15s var(--ease); }
  .node:focus-visible .dot { stroke: var(--ink); stroke-width: 2; }
  .label { fill: var(--ink); font-size: 11.5px; paint-order: stroke; stroke: var(--panel); stroke-width: 3px; stroke-linejoin: round; pointer-events: none; }
  .node.faded .dot { opacity: 0.35; }
  .node.faded .label { opacity: 0.4; }
  .node.on .label { font-weight: 700; }
  .zoom { position: absolute; right: 16px; bottom: 0; display: flex; gap: 6px; }
  .zoom button { min-width: 28px; height: 26px; padding: 0 8px; border: 1px solid var(--line-2); border-radius: 6px; background: var(--panel); color: var(--ink); font: 500 16px var(--font); cursor: pointer; }
  .zoom button.reset { font-size: 12px; }
  .zoom button:hover:not(:disabled) { border-color: var(--accent); }
  .zoom button:disabled { opacity: 0.4; cursor: default; }
</style>
