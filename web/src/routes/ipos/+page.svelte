<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { BRAND } from "$lib/brand";
  import { fetchedAt, int, price, tone } from "$lib/format";

  let { data } = $props();
  const d = $derived(data.dashboard);
  const rows = $derived<any[]>(d?.rows ?? []);

  const VIEWS = [{ key: "gmp", label: "Live GMP" }, { key: "subscription", label: "Subscription" }, { key: "listed", label: "Listing performance" }];
  const STAGE: Record<string, { label: string; cls: string }> = {
    open: { label: "Open", cls: "open" }, closing: { label: "Closes today", cls: "closing" }, upcoming: { label: "Upcoming", cls: "up-next" }, expected: { label: "Expected", cls: "up-next" },
    closed: { label: "Closed", cls: "closed" }, allotted: { label: "Awaiting listing", cls: "closed" }, listed: { label: "Listed", cls: "listed" },
  };
  const ORDER = ["open", "closing", "upcoming", "expected", "closed", "allotted", "listed"];
  const FILTERS = [
    { key: "active", label: "Active", match: (r: any) => r.stage !== "listed" },
    { key: "open", label: "Open", match: (r: any) => r.stage === "open" || r.stage === "closing" },
    { key: "closing", label: "Closing today", match: (r: any) => r.stage === "closing" },
    { key: "upcoming", label: "Upcoming", match: (r: any) => r.stage === "upcoming" || r.stage === "expected" },
    { key: "closed", label: "Closed", match: (r: any) => r.stage === "closed" || r.stage === "allotted" },
    { key: "listed", label: "Listed", match: (r: any) => r.stage === "listed" },
    { key: "all", label: "All", match: () => true },
  ];

  let stageFilter = $state("active");
  let boardFilter = $state("all");
  let onlyGmp = $state(false);
  let search = $state("");
  let budget = $state("");
  let sort = $state<{ key: string; dir: 1 | -1 } | null>(null);
  const amount = $derived(Number(budget.replace(/[^\d]/g, "")) || 0);
  const effectiveStage = $derived(data.view === "listed" ? "listed" : stageFilter);

  const COLS: Record<string, { key: string; label: string; right?: boolean; wide?: boolean; title?: string }[]> = {
    gmp: [
      { key: "gmp", label: "GMP", right: true }, { key: "est_listing", label: "Est. listing", right: true }, { key: "profit_per_lot", label: "Profit / lot", right: true, title: "GMP × shares in a lot, if allotted and the premium holds" },
      { key: "times_total", label: "Sub.", right: true }, { key: "price_high", label: "Price", right: true }, { key: "size_cr", label: "Size", right: true, wide: true }, { key: "lot", label: "Lot", right: true, wide: true },
      { key: "open", label: "Open", wide: true }, { key: "close", label: "Close" }, { key: "allotment", label: "Allot.", wide: true }, { key: "listing", label: "Listing" }, { key: "gmp_updated", label: "Read at", wide: true },
    ],
    subscription: [
      { key: "times_total", label: "Total", right: true }, { key: "qib", label: "QIB", right: true }, { key: "snii", label: "sNII", right: true, title: "Small non-institutional, ₹2–10 lakh" }, { key: "bnii", label: "bNII", right: true, title: "Big non-institutional, above ₹10 lakh" },
      { key: "nii", label: "NII", right: true }, { key: "retail", label: "Retail", right: true }, { key: "demand_cr", label: "Demand", right: true, wide: true, title: "Shares bid for × top of the band" }, { key: "size_cr", label: "Size", right: true, wide: true }, { key: "price_high", label: "Price", right: true, wide: true }, { key: "close", label: "Close" }, { key: "sub_as_of", label: "As of" },
    ],
    listed: [
      { key: "listing", label: "Listed" }, { key: "price_high", label: "Issue price", right: true }, { key: "listing_price", label: "Listing price", right: true }, { key: "listing_gain", label: "Listing gain", right: true }, { key: "cmp", label: "Now", right: true }, { key: "current_gain", label: "Since issue", right: true },
      { key: "times_total", label: "Sub.", right: true, wide: true }, { key: "gmp", label: "Last GMP", right: true, wide: true }, { key: "size_cr", label: "Size", right: true, wide: true },
    ],
  };
  const cols = $derived(COLS[data.view]);

  const stageCount = (key: string) => rows.filter((r) => (boardFilter === "all" || r.board === boardFilter) && FILTERS.find((f) => f.key === key)!.match(r)).length;
  const shown = $derived.by(() => {
    const f = FILTERS.find((x) => x.key === effectiveStage)!;
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => f.match(r) && (boardFilter === "all" || r.board === boardFilter) && (!onlyGmp || (r.gmp ?? 0) !== 0) && (!q || r.name.toLowerCase().includes(q) || (r.symbol ?? "").toLowerCase().includes(q)));
    if (sort) {
      const { key, dir } = sort;
      return [...list].sort((a, b) => {
        const x = a[key], y = b[key];
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1; // unknowns stay last in either direction
        return (typeof x === "string" ? x.localeCompare(y) : x - y) * dir;
      });
    }
    if (effectiveStage === "listed") return [...list].sort((a, b) => (b.listing ?? "").localeCompare(a.listing ?? ""));
    return [...list].sort((a, b) => ORDER.indexOf(a.stage) - ORDER.indexOf(b.stage) || (a.close ?? "9").localeCompare(b.close ?? "9"));
  });
  const toggle = (key: string) => { sort = sort?.key === key ? (sort.dir === -1 ? { key, dir: 1 } : null) : { key, dir: -1 }; };

  const short = (iso: string | null | undefined) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }) : "—");
  const stamp = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) : "—");
  const x = (v: number | null | undefined) => (v == null ? "—" : `${v >= 100 ? v.toFixed(0) : v.toFixed(2)}×`);
  const money = (v: number | null | undefined) => (v == null ? "—" : `${v < 0 ? "−" : ""}₹${Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
  const crore = (v: number | null | undefined) => (v == null ? "—" : `₹${v >= 100 ? Math.round(v).toLocaleString("en-IN") : v.toFixed(2)} Cr`);
  const signed = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}%`);
  const lakhs = (v: number) => (v >= 1e7 ? `₹${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `₹${(v / 1e5).toFixed(2)} L` : `₹${int(v)}`);
  const heat = (v: number | null | undefined) => (v == null ? "" : v >= 50 ? "hot" : v >= 10 ? "warm" : v >= 1 ? "ok" : "cold");

  const fit = (r: any) => {
    if (!amount || !r.costs) return null;
    const lots = Math.floor(amount / r.costs.lot_cost);
    if (!lots) return `Below one lot (${lakhs(r.costs.lot_cost)})`;
    const spend = lots * r.costs.lot_cost;
    return `${lots} lot${lots > 1 ? "s" : ""} · ${lakhs(spend)} · ${spend <= 2e5 ? "Retail" : spend <= 1e6 ? "sNII" : "bNII"}`;
  };

  // Refreshes while the tab is visible; the API decides how often a source is really asked.
  let refreshedAt = $state(Date.now());
  let refreshing = $state(false);
  const refresh = async () => { refreshing = true; await invalidateAll(); refreshedAt = Date.now(); refreshing = false; };
  $effect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 60_000);
    return () => clearInterval(t);
  });
  const source = $derived(d?.sources?.ipoguru);
</script>

<svelte:head>
  <title>IPO GMP & Live Subscription: Mainboard and SME — {BRAND}</title>
  <meta name="description" content="Grey-market premium and live subscription for every mainboard and SME IPO on NSE and BSE, with lot costs, dates and listing performance." />
</svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>IPOs</h1>
      <p class="sub">Mainboard and SME issues on NSE and BSE{#if source?.fetched_at}. Premiums read {fetchedAt(source.fetched_at)}{/if}{#if d?.sources?.nse?.as_of}; exchange bids checked {fetchedAt(d.sources.nse.as_of)}{/if}.</p>
    </div>
    <div class="tabs">
      {#each VIEWS as v}<a href="?view={v.key}" class:active={data.view === v.key} data-sveltekit-noscroll>{v.label}</a>{/each}
    </div>
  </div>

  {#if !d}
    <div class="notice">IPO data is not reachable right now. Try again shortly.</div>
  {:else}
    <section class="strip" aria-label="Issues by stage">
      {#each [["open", "Open", d.counts.open], ["closing", "Closing today", d.counts.closing], ["upcoming", "Upcoming", d.counts.upcoming], ["closed", "Awaiting listing", d.counts.closed], ["listed", "Listed, 3 months", d.counts.listed]] as [key, label, c]}
        <button class="stat" class:on={effectiveStage === key} onclick={() => (stageFilter = stageFilter === key ? "active" : String(key))} disabled={data.view === "listed"}>
          <b>{c.count}</b><span>{label}</span><small>{c.size_cr ? `₹${int(c.size_cr)} Cr` : " "}</small>
        </button>
      {/each}
    </section>

    <div class="controls">
      {#if data.view !== "listed"}
        <div class="chips" role="group" aria-label="Stage">
          {#each FILTERS.filter((f) => f.key !== "listed") as f}
            <button class:on={stageFilter === f.key} onclick={() => (stageFilter = f.key)}>{f.label} <em>{stageCount(f.key)}</em></button>
          {/each}
        </div>
      {/if}
      <div class="chips" role="group" aria-label="Board">
        {#each [["all", "All boards"], ["Mainboard", "Mainboard"], ["SME", "SME"]] as [k, l]}<button class:on={boardFilter === k} onclick={() => (boardFilter = k)}>{l}</button>{/each}
      </div>
      {#if data.view === "gmp"}<label class="check"><input type="checkbox" bind:checked={onlyGmp} /> Only non-zero GMP</label>{/if}
      <input class="find" type="search" placeholder="Find a company" aria-label="Find a company" bind:value={search} />
      <label class="budget"><span>I have</span><input inputmode="numeric" placeholder="₹ 15,000" aria-label="Amount you want to invest" bind:value={budget} /></label>
      <button class="refresh" onclick={refresh} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh"}</button>
      <span class="ticker">Page checked {stamp(new Date(refreshedAt).toISOString())}</span>
    </div>

    <section class="card">
      <div class="table-scroll">
        <table class="board">
          <thead>
            <tr>
              <th class="name-col left">Issue</th>
              {#each cols as c}
                <th class:wide-only={c.wide} class:left={!c.right} title={c.title} aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                  <button class="sorter" onclick={() => toggle(c.key)}>{c.label}<i>{sort?.key === c.key ? (sort.dir === 1 ? "↑" : "↓") : ""}</i></button>
                </th>
              {/each}
              {#if amount}<th class="left">With ₹{int(amount)}</th>{/if}
            </tr>
          </thead>
          <tbody>
            {#each shown as r (r.slug)}
              {@const s = STAGE[r.stage]}
              <tr>
                <td class="name-col left">
                  <div class="who">
                    {#if r.logo}<img src={r.logo} alt="" width="28" height="28" loading="lazy" />{:else}<span class="mono">{r.name.slice(0, 1)}</span>{/if}
                    <div>
                      <a class="sym" href="/ipos/{r.slug}">{r.name}</a>
                      <span class="tags"><span class="pill {s.cls}">{s.label}</span><span class="kind">{r.exchange ?? r.board}</span></span>
                    </div>
                  </div>
                </td>
                {#if data.view === "gmp"}
                  <td class="gmp-cell {r.gmp != null ? tone(r.gmp) : ''}">
                    {#if r.gmp == null}<span class="na">Not quoted</span>{:else}<b>{money(r.gmp)}</b> <small>{r.gmp_pct != null ? `${r.gmp_pct.toFixed(2)}%` : ""}</small>{#if r.gmp_low != null}<span class="range">{money(r.gmp_low)} – {money(r.gmp_high)}</span>{/if}{/if}
                  </td>
                  <td>{r.est_listing != null ? money(r.est_listing) : "—"}</td>
                  <td class={tone(r.profit_per_lot)}>{money(r.profit_per_lot)}</td>
                  <td class="times {heat(r.times_total)}">{x(r.times_total)}</td>
                  <td>{r.price_high != null ? money(r.price_high) : "TBA"}</td>
                  <td class="wide-only">{crore(r.size_cr)}</td>
                  <td class="wide-only">{int(r.lot)}</td>
                  <td class="left wide-only">{short(r.open)}</td>
                  <td class="left">{short(r.close)}</td>
                  <td class="left wide-only">{short(r.allotment)}</td>
                  <td class="left">{short(r.listing)}</td>
                  <td class="left wide-only stamp">{stamp(r.gmp_updated)}</td>
                {:else if data.view === "subscription"}
                  <td class="times {heat(r.times_total)}"><b>{x(r.times_total)}</b></td>
                  <td class="times {heat(r.qib)}">{x(r.qib)}</td>
                  <td class="times {heat(r.snii)}">{x(r.snii)}</td>
                  <td class="times {heat(r.bnii)}">{x(r.bnii)}</td>
                  <td class="times {heat(r.nii)}">{x(r.nii)}</td>
                  <td class="times {heat(r.retail)}">{x(r.retail)}</td>
                  <td class="wide-only">{crore(r.demand_cr)}</td>
                  <td class="wide-only">{crore(r.size_cr)}</td>
                  <td class="wide-only">{r.price_high != null ? money(r.price_high) : "TBA"}</td>
                  <td class="left">{short(r.close)}</td>
                  <td class="left stamp">{#if r.sub_from === "nse"}{stamp(r.sub_as_of)} <em>NSE</em>{:else if r.sub_from === "ipoguru"}<em>Overall only</em>{:else}—{/if}</td>
                {:else}
                  <td class="left">{short(r.listing)}</td>
                  <td>{money(r.price_high)}</td>
                  <td>{money(r.listing_price)}</td>
                  <td class={tone(r.listing_gain)}>{signed(r.listing_gain)}</td>
                  <td>{money(r.cmp)}</td>
                  <td class={tone(r.current_gain)}>{signed(r.current_gain)}</td>
                  <td class="wide-only times {heat(r.times_total)}">{x(r.times_total)}</td>
                  <td class="wide-only">{money(r.gmp)}</td>
                  <td class="wide-only">{crore(r.size_cr)}</td>
                {/if}
                {#if amount}<td class="left fit">{fit(r) ?? "—"}</td>{/if}
              </tr>
            {:else}
              <tr><td class="left empty-row" colspan={cols.length + 1 + (amount ? 1 : 0)}>No issues match these filters.</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    {#if source?.error || !source?.connected}
      <p class="sub warn">{!source?.connected ? "The IPO calendar is not connected, so only issues on NSE's board are listed." : `Showing the last stored premiums: ${source.error}.`}</p>
    {/if}
    <p class="sub source">
      IPO data by <a href="https://www.ipoguru.in/">IPO Guru</a>; category subscription from NSE where it publishes the issue, so BSE-only issues show an overall figure. Grey-market premium is unofficial, indicative data from unregulated dealers and is not a forecast. Profit per lot assumes allotment and that the premium holds. Nothing here is investment advice; read the prospectus before applying.
    </p>
  {/if}
</div>

<style>
  .strip { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 2px; overflow: hidden; margin-bottom: 14px; }
  .stat { display: grid; gap: 2px; padding: 12px 14px; background: var(--panel); border: 0; text-align: left; font: inherit; color: var(--ink); cursor: pointer; }
  .stat:disabled { cursor: default; }
  .stat:not(:disabled):hover { background: var(--panel-2); }
  .stat.on { box-shadow: inset 0 -2px 0 var(--accent); }
  .stat b { font-size: 22px; font-variant-numeric: tabular-nums; }
  .stat span { color: var(--ink-2); font-size: 12.5px; }
  .stat small { color: var(--ink-3); font-size: 12px; min-height: 16px; font-variant-numeric: tabular-nums; }
  .controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin-bottom: 12px; font-size: 13px; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .chips button { padding: 5px 9px; border: 1px solid var(--line-2); border-radius: 2px; background: var(--panel); color: var(--ink-2); font: inherit; cursor: pointer; }
  .chips button:hover { color: var(--ink); }
  .chips button.on { background: var(--ink); border-color: var(--ink); color: var(--panel); }
  .chips em { font-style: normal; opacity: 0.65; margin-left: 2px; font-variant-numeric: tabular-nums; }
  .check, .budget { display: inline-flex; align-items: center; gap: 6px; color: var(--ink-2); }
  .find, .budget input { padding: 5px 9px; border: 1px solid var(--line-2); border-radius: 2px; background: var(--panel); color: var(--ink); font: inherit; }
  .find { width: 170px; }
  .budget input { width: 100px; }
  .refresh { padding: 5px 9px; border: 1px solid var(--line-2); border-radius: 2px; background: var(--panel); color: var(--ink-2); font: inherit; cursor: pointer; }
  .ticker { color: var(--ink-3); font-size: 12px; margin-left: auto; }
  .board th { padding: 0; white-space: nowrap; }
  .board th.name-col { padding: 8px 12px; }
  .sorter { display: inline-flex; gap: 3px; width: 100%; padding: 8px 10px; justify-content: flex-end; background: none; border: 0; color: inherit; font: inherit; cursor: pointer; white-space: nowrap; }
  th.left .sorter { justify-content: flex-start; }
  .sorter i { font-style: normal; width: 9px; }
  .sorter:hover { color: var(--ink); }
  .board td { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .name-col { position: sticky; left: 0; background: var(--panel); z-index: 1; min-width: 230px; max-width: 290px; white-space: normal !important; }
  .who { display: flex; align-items: center; gap: 10px; }
  .who img, .mono { width: 28px; height: 28px; flex: none; border-radius: 2px; object-fit: contain; background: var(--paper-hi); border: 1px solid var(--line); }
  .mono { display: grid; place-items: center; font-size: 13px; font-weight: 600; color: var(--ink-2); background: var(--panel-2); }
  a.sym { font-weight: 600; }
  a.sym:hover { text-decoration: underline; }
  .tags { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 3px; font-size: 11.5px; }
  .kind { color: var(--ink-3); }
  .pill { padding: 1px 6px; border-radius: 2px; background: var(--panel-2); color: var(--ink-2); font-weight: 500; }
  .pill.open { background: var(--up-soft); color: var(--up); }
  .pill.closing { background: var(--accent); color: var(--panel); }
  .pill.listed { color: var(--ink-3); }
  .gmp-cell b { font-weight: 600; }
  .gmp-cell small { font-size: 12px; opacity: 0.85; }
  .range { display: block; color: var(--ink-3); font-size: 11.5px; margin-top: 2px; }
  .na { color: var(--ink-3); }
  .times.hot { color: var(--up); font-weight: 600; }
  .times.warm { color: var(--up); }
  .times.cold { color: var(--ink-3); }
  .stamp { color: var(--ink-3); font-size: 12px; }
  .stamp em { font-style: normal; }
  .fit { font-size: 12.5px; color: var(--ink-2); }
  .empty-row { color: var(--ink-3); padding: 28px 12px !important; }
  .source { font-size: 12.5px; margin-top: 14px; line-height: 1.55; }
  .source a { text-decoration: underline; }
  .warn { color: var(--ink-2); margin-top: 12px; font-size: 13px; }
  .up { color: var(--up); } .down { color: var(--down); }
  @media (max-width: 760px) {
    .strip { grid-template-columns: repeat(3, 1fr); }
    .wide-only { display: none; }
    .name-col { min-width: 170px; max-width: 190px; }
    .ticker { margin-left: 0; width: 100%; }
  }
</style>
