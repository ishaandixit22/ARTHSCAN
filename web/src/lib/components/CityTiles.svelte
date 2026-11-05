<script lang="ts" module>
  /** The day's move as a tile colour, on the same scale in both editions. */
  export function tileColour(change: number | null): string {
    if (change == null) return "var(--panel-2)";
    const strength = Math.round(Math.min(Math.abs(change) / 3, 1) * 72 + 18);
    return `color-mix(in srgb, var(--${change >= 0 ? "up" : "down"}) ${strength}%, var(--bg))`;
  }
</script>

<script lang="ts">
  // The phone's view of the Nifty 100: one row of tiles per sector, biggest sectors first, drawn with
  // plain HTML so it costs no script. The 3D city, with its WebGL, loads only when someone asks for it.
  import { pct, tone } from "$lib/format";
  import type { CityStock } from "$lib/components/MarketCity.svelte";

  let { stocks }: { stocks: CityStock[] } = $props();

  const sectors = $derived.by(() => {
    const by = new Map<string, CityStock[]>();
    for (const s of stocks) by.set(s.sector || "Other", [...(by.get(s.sector || "Other") ?? []), s]);
    return [...by.entries()]
      .map(([sector, list]) => {
        const moved = list.filter((s) => s.change != null);
        const avg = moved.length ? moved.reduce((a, s) => a + s.change!, 0) / moved.length : null;
        return { sector, avg, list: [...list].sort((a, z) => (z.change ?? 0) - (a.change ?? 0)) };
      })
      .sort((a, z) => z.list.length - a.list.length);
  });
</script>

<ul class="tiles">
  {#each sectors as g (g.sector)}
    <li>
      <a href="/sectors/{encodeURIComponent(g.sector)}">
        <span class="head"><b>{g.sector}</b><span class={tone(g.avg)}>{pct(g.avg)}</span></span>
        <span class="row" aria-hidden="true">
          {#each g.list as s (s.symbol)}<i style="background: {tileColour(s.change)}"></i>{/each}
        </span>
      </a>
    </li>
  {/each}
</ul>

<style>
  .tiles { list-style: none; margin: 0; padding: 0; }
  a { display: grid; gap: 5px; padding: 9px 0; border-bottom: 1px solid var(--line); color: var(--ink); }
  a:active { background: var(--panel-2); }
  .head { display: flex; justify-content: space-between; gap: 12px; font-size: 13.5px; font-stretch: 88%; }
  .head b { font-weight: 650; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .head span { font-weight: 800; flex: none; }
  .row { display: flex; flex-wrap: wrap; gap: 2px; }
  i { display: block; width: 18px; height: 18px; }
</style>
