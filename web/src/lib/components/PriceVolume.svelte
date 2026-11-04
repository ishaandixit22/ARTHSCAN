<script lang="ts">
  // Price and volume: returns over nine windows on one side, recent volume bars on the other.
  import { compact, pct, tone } from "$lib/format";

  let { stats, loading }: { stats: any | null; loading: boolean } = $props();
  const r = $derived(stats?.returns ?? {});
  const WINDOWS = [["YTD", "ytd"], ["1 week", "w1"], ["1 month", "m1"], ["3 months", "m3"], ["6 months", "m6"], ["1 year", "y1"], ["2 years", "y2"], ["3 years", "y3"], ["5 years", "y5"]] as const;
  const rows = $derived((stats?.volume ?? []) as { label: string; volume: number; deliv_pct: number | null; deliv_volume: number | null }[]);
  const peak = $derived(Math.max(1, ...rows.map((x) => x.volume)));
  const anyDelivery = $derived(rows.some((x) => x.deliv_pct != null));
</script>

<div class="pv">
  <section aria-label="Returns">
    <h3>Returns</h3>
    {#if stats}
      <div class="returns">
        {#each WINDOWS as [label, key]}
          <div><span>{label}</span><b class={tone(r[key])}>{pct(r[key])}</b></div>
        {/each}
      </div>
      <p class="note">Absolute price returns, adjusted for splits and bonuses. A dash means it hasn't traded that long.</p>
    {:else}
      <div class="empty">{loading ? "Working out returns…" : "Returns aren't available right now."}</div>
    {/if}
  </section>
  <section aria-label="Volume">
    <h3>Volume</h3>
    {#if rows.length}
      <div class="bars">
        {#each rows as x}
          <div class="row">
            <span class="name">{x.label}</span>
            <div class="track">
              <i class="vol" style="width: {(x.volume / peak) * 100}%"></i>
              {#if x.deliv_volume != null}<i class="del" style="width: {(x.deliv_volume / peak) * 100}%"></i>{/if}
            </div>
            <span class="fig"><b>{compact(x.volume)}</b>{#if x.deliv_volume != null}<small>{compact(x.deliv_volume)} ({x.deliv_pct?.toFixed(1)}%)</small>{/if}</span>
          </div>
        {/each}
      </div>
      <p class="note">
        <i class="key vol"></i>Shares traded
        {#if anyDelivery}<i class="key del"></i>Taken for delivery, not sold again the same day{:else}· Delivery figures come from NSE's file, so a BSE-only stock has none{/if}
      </p>
    {:else}
      <div class="empty">{loading ? "Working out volumes…" : "Volume isn't available right now."}</div>
    {/if}
  </section>
</div>

<style>
  .pv { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: 28px 44px; }
  h3 { margin: 0 0 10px; padding-top: 8px; border-top: var(--rule-heavy); font: 800 18px var(--display); font-stretch: 78%; }
  .returns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .returns div { display: grid; gap: 2px; padding: 10px 0; border-bottom: 1px dotted var(--line-2); }
  .returns span { color: var(--ink-2); font-size: 13px; font-weight: 600; }
  .returns b { font: 800 22px var(--display); font-stretch: 72%; font-variant-numeric: tabular-nums; }
  .bars { display: grid; gap: 12px; }
  .row { display: grid; grid-template-columns: 90px minmax(0, 1fr) 118px; gap: 12px; align-items: center; }
  .name { color: var(--ink-2); font-size: 13.5px; }
  .track { display: grid; gap: 2px; }
  .track i { display: block; height: 16px; }
  .vol { background: color-mix(in srgb, var(--series) 62%, var(--bg)); }
  .del { background: color-mix(in srgb, var(--up) 55%, var(--bg)); }
  .fig { display: grid; font-variant-numeric: tabular-nums; font-size: 14px; }
  .fig small { color: var(--ink-3); font-size: 12px; }
  .note { margin: 10px 0 0; color: var(--ink-3); font-size: 12.5px; line-height: 1.5; }
  .key { display: inline-block; width: 10px; height: 10px; margin: 0 5px 0 10px; }
  .key:first-child { margin-left: 0; }
  @media (max-width: 860px) { .pv { grid-template-columns: minmax(0, 1fr); } .row { grid-template-columns: 74px minmax(0, 1fr) 96px; } }
</style>
