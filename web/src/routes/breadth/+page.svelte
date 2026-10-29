<script lang="ts">
  import { goto } from "$app/navigation";
  import { BRAND } from "$lib/brand";
  import LiveStamp from "$lib/components/LiveStamp.svelte";
  import StockTable from "$lib/components/StockTable.svelte";
  import { date, int } from "$lib/format";
  import { session } from "$lib/session.svelte";
  import { market, useLiveMarket } from "$lib/liveMarket.svelte";

  let { data } = $props();
  const TABS = [
    ["advances", "Advancing"], ["declines", "Declining"], ["unchanged", "Unchanged"], ["highs", "52-week highs"], ["lows", "52-week lows"],
  ] as const;

  // During the session (for accounts with live prices) the counts and lists come from
  // the live feed every 15 seconds; otherwise from NSE's close.
  const liveNow = $derived(!!data.live && session.open);
  $effect(() => (liveNow ? useLiveMarket() : undefined)); // drives the "Live" stamp
  type LiveRow = { symbol: string; name: string; sector: string; ltp: number; change_pct: number; turnover: number };
  let liveList = $state<{ universe: number; counts: Record<string, number>; stocks: LiveRow[] } | null>(null);
  $effect(() => {
    if (!liveNow) { liveList = null; return; }
    const show = data.show;
    let stop = false;
    const pull = async () => {
      const r = await fetch(`/api/live/breadth?show=${show}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (!stop) liveList = r?.session === "open" && r.universe > 0 ? r : null;
    };
    void pull();
    const t = setInterval(pull, 15_000);
    return () => { stop = true; clearInterval(t); };
  });

  const eod = $derived(data.list);
  const counts = $derived(liveList ? liveList.counts : eod.counts);
  const universe = $derived(liveList ? liveList.universe : eod.counts?.stocks);
  const rows = $derived(
    liveList
      ? liveList.stocks.filter((s) => !data.sector || s.sector === data.sector).slice(0, data.n)
          .map((s) => ({ symbol: s.symbol, name: s.name, sector: s.sector, close: s.ltp, change_pct: s.change_pct, turnover: s.turnover }))
      : eod.results,
  );
  const total = $derived(liveList ? liveList.stocks.filter((s) => !data.sector || s.sector === data.sector).length : eod.total);
  const adv = $derived((counts?.advances ?? 0) / Math.max(1, (counts?.advances ?? 0) + (counts?.declines ?? 0)));
  const href = (p: Record<string, string | null>) => {
    const q = new URLSearchParams({ ...(data.show !== "advances" && { show: data.show }), ...(data.sector && { sector: data.sector }), ...p as Record<string, string> });
    for (const [k, v] of Object.entries(p)) if (!v) q.delete(k);
    return q.size ? `?${q}` : "?";
  };
  const heading = $derived(TABS.find(([k]) => k === data.show)?.[1] ?? "Advancing");
</script>

<svelte:head><title>Market breadth: {heading.toLowerCase()} — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>Market breadth</h1>
      <p class="sub">
        Across <b>{int(universe)}</b> stocks: every ordinary share traded on NSE, main board and SME, with ETFs and funds excluded.
        {#if liveList}{" "}<LiveStamp close="" />{:else}{" "}At the close of {date(eod.as_of)}.{/if}
      </p>
    </div>
  </div>

  <div class="ratio">
    <div class="bar" aria-hidden="true"><span style="width: {adv * 100}%"></span></div>
    <p class="sub"><b class="up">{int(counts?.advances)}</b> advancing · <b class="down">{int(counts?.declines)}</b> declining · {int(counts?.unchanged)} unchanged · advance/decline ratio <b>{counts?.declines ? (counts.advances / counts.declines).toFixed(2) : "—"}</b></p>
  </div>

  <div class="controls">
    <nav class="tabs" aria-label="Which stocks">
      {#each TABS as [k, label]}
        <a href={href({ show: k === "advances" ? null : k, n: null })} class:active={data.show === k} data-sveltekit-noscroll>{label} <span class="n">{int(counts?.[k])}</span></a>
      {/each}
    </nav>
    <select aria-label="Sector" onchange={(e) => goto(href({ sector: e.currentTarget.value || null, n: null }), { noScroll: true })}>
      <option value="">All sectors</option>
      {#each data.sectorList as s}<option value={s} selected={data.sector === s}>{s}</option>{/each}
    </select>
  </div>

  <section class="card">
    <div class="card-head"><h2>{heading}{data.sector ? ` · ${data.sector}` : ""}</h2><span class="sub">{total} stocks{rows.length < total ? `, showing ${rows.length}` : ""}</span></div>
    {#if rows.length}
      <StockTable {rows} cols={["close", "change_pct", "turnover", "sector"]} />
      {#if rows.length < total}<a class="more" href={href({ n: String(data.n + 200) })} data-sveltekit-noscroll>Show 200 more →</a>{/if}
    {:else}
      <div class="empty">No stocks here{data.sector ? " in this sector" : ""}.</div>
    {/if}
  </section>
  <p class="sub small">52-week high and low compare the close with the highest and lowest close of the past year (split-adjusted); live, a stock counts once it trades beyond its previous 52-week range.</p>
</div>

<style>
  .ratio { display: grid; gap: 8px; }
  .bar { height: 6px; border-radius: 3px; background: var(--down); overflow: hidden; }
  .bar span { display: block; height: 100%; background: var(--up); }
  .ratio b { font-family: var(--mono); font-weight: 500; }
  .controls { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px 24px; border-bottom: 1px solid var(--line); }
  .controls .tabs { flex-wrap: wrap; gap: 4px 22px; }
  .controls .tabs a { padding: 9px 0; font-size: 14px; }
  .n { color: var(--ink-3); font-family: var(--mono); font-size: 11.5px; margin-left: 3px; }
  .more { display: block; padding: 12px 18px; border-top: 1px solid var(--line); font-size: 13px; color: var(--brand-2); }
  .small { font-size: 12.5px; }
</style>
