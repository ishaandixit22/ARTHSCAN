<script lang="ts">
  // Nifty 50 ticker across the top of every page. Scrolls with a CSS animation
  // (two copies of the row, shifted by half), pauses on hover or keyboard focus,
  // and becomes a still, swipeable row for visitors who prefer reduced motion.
  // Shows the last NSE close; accounts with live access get Dhan prices in place.
  import { date, pct, tone } from "$lib/format";
  import { live, watch } from "$lib/live.svelte";
  import { session } from "$lib/session.svelte";

  type Quote = { symbol: string; close: number | null; change_pct: number | null; as_of: string | null };
  let { quotes, liveAccess: access = false }: { quotes: Quote[]; liveAccess?: boolean } = $props();
  // Live only while the market is open; otherwise NSE's close.
  const liveAccess = $derived(access && session.open);

  $effect(() => (liveAccess && quotes.length ? watch(quotes.map((q) => q.symbol)) : undefined));

  const rows = $derived(
    quotes.map((q) => {
      const lq = liveAccess ? live.quotes[q.symbol] : undefined;
      return { symbol: q.symbol, price: lq?.ltp ?? q.close, change: lq ? lq.changePct : q.change_pct };
    }),
  );
  const isLive = $derived(liveAccess && rows.some((r) => live.quotes[r.symbol]));
  const asOf = $derived(quotes.find((q) => q.as_of)?.as_of ?? null);
  const fmt = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // About 45px a second whatever the row length.
  const seconds = $derived(Math.max(40, rows.length * 3.2));
</script>

{#if rows.length}
  <div class="ticker" aria-label="Nifty 50 prices">
    <div class="label">
      <b>NIFTY 50</b>
      <span class="when">{#if isLive}<i class="dot"></i>Live{:else}Close {date(asOf).replace(/ \d{4}$/, "")}{/if}</span>
    </div>
    <div class="viewport">
      <div class="track" style="--dur: {seconds}s">
        {#each [0, 1] as copy}
          <ul class="set" aria-hidden={copy === 1 ? "true" : undefined}>
            {#each rows as r (r.symbol)}
              <li>
                <a href="/stock/{encodeURIComponent(r.symbol)}" tabindex={copy === 1 ? -1 : undefined}>
                  <span class="sym">{r.symbol}</span>
                  <span class="px">{r.price == null ? "—" : fmt.format(r.price)}</span>
                  <span class="chg {tone(r.change)}">{pct(r.change)}</span>
                </a>
              </li>
            {/each}
          </ul>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .ticker { display: flex; align-items: stretch; height: 36px; background: var(--panel); border-bottom: 1px solid var(--line); font-size: 12.5px; font-variant-numeric: tabular-nums; }
  .label { display: flex; align-items: center; gap: 8px; padding: 0 12px 0 16px; border-right: 1px solid var(--line); white-space: nowrap; flex-shrink: 0; }
  .label b { font-weight: 600; letter-spacing: 0.02em; color: var(--brand); }
  .when { color: var(--ink-3); font-size: 12px; display: flex; align-items: center; gap: 5px; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--up); }
  .viewport { flex: 1; min-width: 0; overflow: hidden; mask-image: linear-gradient(to right, transparent, #000 24px, #000 calc(100% - 24px), transparent); }
  .track { display: flex; width: max-content; height: 100%; animation: scroll var(--dur) linear infinite; }
  .ticker:hover .track, .ticker:focus-within .track { animation-play-state: paused; }
  .set { display: flex; margin: 0; padding: 0; list-style: none; }
  li a { display: flex; align-items: center; gap: 6px; height: 100%; padding: 0 14px; white-space: nowrap; color: var(--ink); }
  li a:hover { background: var(--panel-2); color: var(--ink); }
  .sym { font-weight: 600; }
  .px, .chg { font-family: var(--mono); font-size: 12px; }
  .px { color: var(--ink-2); }
  @keyframes scroll { to { transform: translateX(-50%); } }
  @media (prefers-reduced-motion: reduce) {
    .viewport { overflow-x: auto; scrollbar-width: none; mask-image: none; }
    .track { animation: none; }
    .set[aria-hidden] { display: none; }
  }
  @media (max-width: 640px) { .when { display: none; } .label { padding: 0 10px 0 12px; } }
</style>
