<script lang="ts">
  import Logo from "$lib/components/Logo.svelte";
  import { live, watch } from "$lib/live.svelte";
  import { date, pct, tone } from "$lib/format";

  type Row = {
    symbol: string; name: string; isin: string | null; sector: string; close: number | null; change_pct: number | null;
    shares: number | null; iwf: number | null; ff_mcap_cr: number | null; weight: number | null;
  };
  let { rows, asOf, label, liveAccess = false }: { rows: Row[]; asOf: string | null; label: string; liveAccess?: boolean } = $props();

  // During the session each price ticks in over the live feed, and the free-float caps and weights move with it.
  $effect(() => (liveAccess && rows.length ? watch(rows.map((r) => r.symbol)) : undefined));
  const isLive = $derived(liveAccess && rows.some((r) => live.quotes[r.symbol]?.ltp));

  const current = $derived.by(() => {
    const out = rows.map((r) => {
      const q = isLive ? live.quotes[r.symbol] : undefined;
      const price = q?.ltp ?? r.close;
      const change = q?.changePct ?? r.change_pct;
      const ff = r.shares && r.iwf != null && price ? (price * r.shares * r.iwf) / 1e7 : r.ff_mcap_cr;
      return { ...r, price, change, ff };
    });
    const total = out.reduce((s, r) => s + (r.ff ?? 0), 0);
    return out.map((r) => ({ ...r, w: total && r.ff != null ? (r.ff / total) * 100 : null }));
  });

  type Sort = "weight" | "gainers" | "losers" | "name";
  let sort = $state<Sort>("weight");
  const sorted = $derived(
    [...current].sort((a, z) =>
      sort === "weight" ? (z.w ?? -1) - (a.w ?? -1) || (z.ff ?? 0) - (a.ff ?? 0)
      : sort === "gainers" ? (z.change ?? -99) - (a.change ?? -99)
      : sort === "losers" ? (a.change ?? 99) - (z.change ?? 99)
      : a.name.localeCompare(z.name)),
  );
  const LIMIT = 25;
  let showAll = $state(false);
  const shown = $derived(showAll ? sorted : sorted.slice(0, LIMIT));
  const maxW = $derived(Math.max(1, ...current.map((r) => r.w ?? 0)));
  const weighted = $derived(current.filter((r) => r.w != null).length);
  const adv = $derived(current.filter((r) => (r.change ?? 0) > 0).length);
  const dec = $derived(current.filter((r) => (r.change ?? 0) < 0).length);

  const inr0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
  const money = (v: number | null) => (v == null ? "—" : `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(v)}`);
  // ₹12,30,484 Cr reads long in a column; lakh crore is how Indian papers write the largest caps.
  const ffText = (v: number | null) => (v == null ? "—" : v >= 1e5 ? `₹${(v / 1e5).toFixed(2)} L Cr` : `₹${inr0.format(v)} Cr`);
</script>

<div class="head">
  <p class="sum">
    {rows.length} stocks · <span class="up">{adv} up</span> · <span class="down">{dec} down</span>
    · {#if isLive}<b class="live">Live</b> prices and weights{:else}close of {date(asOf)}{/if}
  </p>
  <div class="sorts" role="group" aria-label="Sort constituents">
    {#each [["weight", "Weight"], ["gainers", "Gainers"], ["losers", "Losers"], ["name", "A–Z"]] as [k, l] (k)}
      <button class:on={sort === k} aria-pressed={sort === k} onclick={() => (sort = k as Sort)}>{l}</button>
    {/each}
  </div>
</div>

<div class="table-scroll">
  <table class="cons">
    <thead>
      <tr>
        <th>Company</th>
        <th class="num">Price</th>
        <th class="num">Day</th>
        <th class="wcol num"><span class="wide-l">Index </span>weight</th>
        <th class="num wide">Free-float m-cap</th>
        <th class="num wide" title="Investable weight factor: the share of the company's stock that is free to trade">IWF</th>
      </tr>
    </thead>
    <tbody>
      {#each shown as r (r.symbol)}
        <tr>
          <td>
            <a class="co" href="/stock/{r.symbol}">
              <Logo isin={r.isin} symbol={r.symbol} size={34} />
              <span class="names"><span class="nm">{r.name.replace(/\s+(limited|ltd\.?)$/i, "")}</span><span class="sy">{r.symbol}<span class="secn"> · {r.sector}</span></span></span>
            </a>
          </td>
          <td class="num">{money(r.price)}</td>
          <td class="num {tone(r.change)}">{pct(r.change)}</td>
          <td class="wcol">
            {#if r.w != null}
              <div class="ww">
                <span class="wbar" aria-hidden="true"><span style="width: {(r.w / maxW) * 100}%"></span></span>
                <b>{r.w.toFixed(2)}%</b>
              </div>
            {:else}<span class="na">—</span>{/if}
          </td>
          <td class="num wide">{ffText(r.ff)}</td>
          <td class="num wide">{r.iwf != null ? r.iwf.toFixed(2) : "—"}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

{#if sorted.length > LIMIT}
  <button class="all" onclick={() => (showAll = !showAll)}>{showAll ? "Show fewer" : `Show all ${sorted.length} stocks`}</button>
{/if}

<p class="note">
  Free-float market cap = price × shares outstanding × IWF. Shares come from each company's market cap, and IWF is taken as 1 − promoter holding from its
  latest shareholding pattern. Weight is each stock's share of the {label}'s total free-float market cap. NSE also caps some weights and excludes other locked-in
  holdings, so these are close estimates, not NSE's published weights.
  {#if weighted < rows.length}<br />Weights for {rows.length - weighted} of {rows.length} stocks are still loading; their shareholding is fetched outside market hours.{/if}
</p>

<style>
  .head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; margin: 4px 0 12px; }
  .sum { margin: 0; font-size: 14px; color: var(--ink-2); }
  .live { color: var(--up); }
  .sorts { display: flex; gap: 6px; }
  .sorts button { padding: 5px 11px; border: 1px solid var(--line); border-radius: 999px; background: none; font: inherit; font-size: 13px; font-weight: 600; color: var(--ink-2); cursor: pointer; }
  .sorts button.on { background: var(--ink); border-color: var(--ink); color: var(--bg); }

  .cons { width: 100%; border-collapse: collapse; }
  .cons th { text-align: left; font-size: 12px; font-weight: 600; color: var(--ink-3); padding: 8px 10px 8px 0; border-bottom: 1px solid var(--line-2); white-space: nowrap; }
  .cons td { padding: 9px 10px 9px 0; border-bottom: 1px solid var(--line); font-variant-numeric: tabular-nums; font-size: 14px; vertical-align: middle; }
  .num { text-align: right; white-space: nowrap; }
  .cons th.num { text-align: right; }
  .co { display: flex; align-items: center; gap: 10px; color: var(--ink); min-width: 0; }
  .co:hover .nm { text-decoration: underline; text-underline-offset: 3px; }
  .names { display: grid; min-width: 0; }
  .nm { font-weight: 600; line-height: 1.25; min-width: 130px; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .sy { font-size: 12px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px; }
  .wcol { width: 150px; padding-left: 14px !important; }
  .ww { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
  .wbar { flex: 1; height: 6px; background: var(--line); border-radius: 3px; overflow: hidden; }
  .wbar span { display: block; height: 100%; background: var(--ink); border-radius: 3px; }
  .wcol b { min-width: 48px; text-align: right; font-size: 13.5px; }
  .na { color: var(--ink-3); }
  .all { margin-top: 12px; padding: 8px 14px; border: 1px solid var(--line-2); border-radius: 8px; background: none; font: inherit; font-weight: 600; font-size: 14px; color: var(--ink); cursor: pointer; }
  .note { margin-top: 14px; font-size: 12.5px; line-height: 1.5; color: var(--ink-3); max-width: 80ch; }

  @media (max-width: 760px) {
    .wide { display: none; }
    .nm { min-width: 110px; }
    .sy { max-width: 150px; }
    .wcol { width: auto; padding-left: 8px !important; }
    .wbar { display: none; }
    .wcol b { min-width: 0; }
    .secn, .wide-l { display: none; }
  }
</style>
