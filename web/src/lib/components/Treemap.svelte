<script lang="ts" module>
  export type TreemapItem = { key: string; label: string; sub?: string; value: number; change: number | null; href?: string; title?: string };
  export type TreemapGroup = TreemapItem & { items?: TreemapItem[] };

  type Rect = { x: number; y: number; w: number; h: number };

  /** Squarified treemap (Bruls, Huizing, van Wijk): tiles close to square, areas proportional to value. */
  export function squarify<T extends { value: number }>(items: T[], box: Rect): (Rect & { item: T })[] {
    const total = items.reduce((a, i) => a + Math.max(0, i.value), 0);
    if (!total || box.w <= 0 || box.h <= 0) return [];
    const scaled = items
      .filter((i) => i.value > 0)
      .sort((a, b) => b.value - a.value)
      .map((item) => ({ item, area: (item.value / total) * box.w * box.h }));
    const out: (Rect & { item: T })[] = [];
    let rect = { ...box };
    let row: typeof scaled = [];
    const worst = (r: typeof scaled, side: number) => {
      const s = r.reduce((a, x) => a + x.area, 0);
      const max = Math.max(...r.map((x) => x.area)), min = Math.min(...r.map((x) => x.area));
      return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
    };
    const place = (r: typeof scaled) => {
      const s = r.reduce((a, x) => a + x.area, 0);
      if (rect.w >= rect.h) {
        const colW = s / rect.h;
        let y = rect.y;
        for (const x of r) { const h = x.area / colW; out.push({ x: rect.x, y, w: colW, h, item: x.item }); y += h; }
        rect = { x: rect.x + colW, y: rect.y, w: rect.w - colW, h: rect.h };
      } else {
        const rowH = s / rect.w;
        let x0 = rect.x;
        for (const x of r) { const w = x.area / rowH; out.push({ x: x0, y: rect.y, w, h: rowH, item: x.item }); x0 += w; }
        rect = { x: rect.x, y: rect.y + rowH, w: rect.w, h: rect.h - rowH };
      }
    };
    for (let i = 0; i < scaled.length; ) {
      const side = Math.min(rect.w, rect.h);
      if (!row.length || worst([...row, scaled[i]], side) <= worst(row, side)) row.push(scaled[i++]);
      else { place(row); row = []; }
    }
    if (row.length) place(row);
    return out;
  }
</script>

<script lang="ts">
  // One heatmap: groups (sectors) laid out as labelled blocks, each filled with
  // its stocks; or, with no items, one tile per group. Colour is the change for
  // the period; labels appear only where a tile is big enough to read.
  let { groups, height = 600, scale = 3, label }: { groups: TreemapGroup[]; height?: number; scale?: number; label: string } = $props();

  let width = $state(0);
  const HEADER = 20;
  const GAP = 2;

  const layout = $derived.by(() => {
    if (!width) return [];
    return squarify(groups, { x: 0, y: 0, w: width, h: height }).map((g) => {
      const items = g.item.items;
      const inner = items?.length && g.h > HEADER + 12 ? { x: g.x + GAP, y: g.y + HEADER, w: g.w - GAP * 2, h: g.h - HEADER - GAP } : null;
      return { ...g, tiles: inner ? squarify(items!, inner) : [] };
    });
  });

  const colour = (c: number | null) => {
    if (c == null) return "var(--panel-2)";
    const t = Math.max(-1, Math.min(1, c / scale));
    // Capped so labels on the strongest tiles keep their contrast.
    return `color-mix(in srgb, var(${t >= 0 ? "--up" : "--down"}) ${Math.round(14 + Math.abs(t) * 46)}%, var(--panel))`;
  };
  const pct = (c: number | null) => (c == null ? "—" : `${c > 0 ? "+" : ""}${c.toFixed(2)}%`);
  const fits = (w: number, h: number, minW: number, minH: number) => w >= minW && h >= minH;
</script>

<div class="map" bind:clientWidth={width} style="height: {height}px" role="img" aria-label={label}>
  {#each layout as g (g.item.key)}
    {#if g.item.items?.length}
      <div class="group" style="left: {g.x}px; top: {g.y}px; width: {g.w}px; height: {g.h}px">
        {#if fits(g.w, g.h, 60, HEADER + 6)}
          <a class="ghead" href={g.item.href} title={g.item.title ?? g.item.label}>
            <span class="gname">{g.item.label}</span>{#if fits(g.w, g.h, 150, 0)}<span class="gchg">{pct(g.item.change)}</span>{/if}
          </a>
        {/if}
      </div>
      {#each g.tiles as t (t.item.key)}
        <a class="tile" href={t.item.href} title={t.item.title ?? `${t.item.label}: ${pct(t.item.change)}`}
          style="left: {t.x + GAP / 2}px; top: {t.y + GAP / 2}px; width: {Math.max(0, t.w - GAP)}px; height: {Math.max(0, t.h - GAP)}px; background: {colour(t.item.change)}">
          {#if fits(t.w, t.h, 42, 26)}
            <span class="sym" style="font-size: {Math.min(15, Math.max(10.5, Math.sqrt(t.w * t.h) / 7))}px">{t.item.label}</span>
            {#if fits(t.w, t.h, 48, 40)}<span class="chg">{pct(t.item.change)}</span>{/if}
          {/if}
        </a>
      {/each}
    {:else}
      <a class="tile big" href={g.item.href} title={g.item.title ?? `${g.item.label}: ${pct(g.item.change)}`}
        style="left: {g.x + GAP / 2}px; top: {g.y + GAP / 2}px; width: {Math.max(0, g.w - GAP)}px; height: {Math.max(0, g.h - GAP)}px; background: {colour(g.item.change)}">
        {#if fits(g.w, g.h, 60, 34)}
          <span class="sym" style="font-size: {Math.min(18, Math.max(11, Math.sqrt(g.w * g.h) / 9))}px">{g.item.label}</span>
          {#if fits(g.w, g.h, 70, 52)}<span class="chg">{pct(g.item.change)}</span>{/if}
          {#if g.item.sub && fits(g.w, g.h, 110, 74)}<span class="sub">{g.item.sub}</span>{/if}
        {/if}
      </a>
    {/if}
  {/each}
</div>

<style>
  .map { position: relative; width: 100%; overflow: hidden; border-radius: var(--radius); background: var(--bg); }
  .group { position: absolute; }
  .ghead { position: absolute; inset: 0 0 auto 0; height: 20px; display: flex; justify-content: space-between; gap: 6px; align-items: center; padding: 0 6px; font-size: 11.5px; font-weight: 600; color: var(--ink-2); overflow: hidden; }
  .ghead:hover { color: var(--ink); }
  .gname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gchg { font: 500 11px var(--mono); flex-shrink: 0; }
  .tile {
    position: absolute; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 1px;
    border-radius: 3px; color: var(--ink); overflow: hidden; text-align: center; padding: 2px;
    transition: outline-color 0.12s var(--ease), filter 0.12s var(--ease);
    outline: 2px solid transparent; outline-offset: -2px;
  }
  .tile:hover { outline-color: var(--ink); color: var(--ink); z-index: 2; filter: brightness(1.06); }
  .sym { font-weight: 600; line-height: 1.1; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chg { font: 500 11px var(--mono); line-height: 1.2; }
  .tile.big .chg { font-size: 13px; }
  .sub { font-size: 11px; color: var(--ink-2); }
  @media (prefers-reduced-motion: reduce) { .tile { transition: none; } }
</style>
