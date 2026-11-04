<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { page } from "$app/state";
  import { BRAND } from "$lib/brand";
  import IpoLogo from "$lib/components/IpoLogo.svelte";
  import { date, fetchedAt, int, todayIST, tone } from "$lib/format";

  let { data } = $props();
  const d = $derived(data.dashboard);
  const rows = $derived<any[]>(d?.rows ?? []);
  const today = todayIST();
  const dayMs = 86_400_000;
  const daysTo = (iso: string) => Math.round((Date.parse(iso) - Date.parse(today)) / dayMs);
  const monthAgo = new Date(Date.parse(today) - 31 * dayMs).toISOString().slice(0, 10);

  type Tab = "open" | "upcoming" | "expected" | "closed" | "listed";
  const TABS: { key: Tab; label: string; heading: string; stages: string[]; empty: string }[] = [
    { key: "open", label: "Open", heading: "Open for bidding", stages: ["open", "closing"], empty: "No IPO is taking bids right now." },
    { key: "upcoming", label: "Upcoming", heading: "Opening soon", stages: ["upcoming"], empty: "No IPO has announced its bidding dates right now. New issues appear here as soon as the dates are out." },
    { key: "expected", label: "Expected", heading: "Expected, dates awaited", stages: ["expected"], empty: "No company on SEBI's recent filing list is waiting for dates right now, and our IPO data provider isn't quoting one." },
    { key: "closed", label: "Closed", heading: "Bidding closed, not yet listed", stages: ["closed", "allotted"], empty: "No IPO is waiting to list right now." },
    { key: "listed", label: "Listed", heading: "Recently listed", stages: ["listed"], empty: "No IPO listed in this period." },
  ];
  const num = (key: string) => (a: any, b: any) => (a[key] == null ? 1 : b[key] == null ? -1 : b[key] - a[key]);
  const soonest = (key: string) => (a: any, b: any) => (a[key] ?? "9").localeCompare(b[key] ?? "9");
  const latest = (key: string) => (a: any, b: any) => (b[key] ?? "").localeCompare(a[key] ?? "");
  const SORTS: Record<Tab, { key: string; label: string; by: ((a: any, b: any) => number) | null }[]> = {
    open: [{ key: "close", label: "Closing soon", by: soonest("close") }, { key: "sub", label: "Most subscribed", by: num("times_total") }, { key: "gmp", label: "Highest GMP", by: num("gmp_pct") }, { key: "size", label: "Largest issue", by: num("size_cr") }],
    upcoming: [{ key: "open", label: "Opening soon", by: soonest("open") }, { key: "gmp", label: "Highest GMP", by: num("gmp_pct") }, { key: "size", label: "Largest issue", by: num("size_cr") }],
    expected: [{ key: "provider", label: "Newest first", by: null }, { key: "name", label: "A to Z", by: (a, b) => a.name.localeCompare(b.name) }, { key: "gmp", label: "Highest GMP", by: num("gmp") }],
    closed: [{ key: "listing", label: "Listing soon", by: soonest("listing") }, { key: "sub", label: "Most subscribed", by: num("times_total") }, { key: "gmp", label: "Highest GMP", by: num("gmp_pct") }, { key: "size", label: "Largest issue", by: num("size_cr") }],
    listed: [{ key: "listing", label: "Recently listed", by: latest("listing") }, { key: "gain", label: "Best listing gain", by: num("listing_gain") }, { key: "since", label: "Best since issue", by: num("current_gain") }, { key: "sub", label: "Most subscribed", by: num("times_total") }, { key: "size", label: "Largest issue", by: num("size_cr") }],
  };

  // Listed means the last month unless the reader asks for everything the calendar carries.
  let allListed = $state(false);
  const recent = (r: any) => (r.listing ?? "") >= monthAgo;
  const inTab = (t: (typeof TABS)[number]) => rows.filter((r) => t.stages.includes(r.stage) && (t.key !== "listed" || allListed || recent(r)));
  const counts = $derived(Object.fromEntries(TABS.map((t) => [t.key, inTab(t).length])) as Record<Tab, number>);

  // The tab is in the address so it can be shared. Old ?view=listed links still land in the right place.
  const asked = $derived(page.url.searchParams.get("tab") ?? (page.url.searchParams.get("view") === "listed" ? "listed" : null));
  const fallback = $derived<Tab>(counts.open ? "open" : counts.upcoming ? "upcoming" : counts.closed ? "closed" : "listed");
  const tab = $derived(TABS.find((t) => t.key === asked) ?? TABS.find((t) => t.key === fallback)!);

  let search = $state("");
  let board = $state("all");
  let sorts = $state<Partial<Record<Tab, string>>>({});
  const sortKey = $derived(sorts[tab.key] ?? SORTS[tab.key][0].key);
  const boardKey = (r: any) => (r.board === "SME" ? (/bse/i.test(r.exchange ?? "") ? "bse-sme" : "nse-sme") : "mainboard");
  const BOARDS = [["all", "All boards"], ["mainboard", "Mainboard"], ["nse-sme", "NSE SME"], ["bse-sme", "BSE SME"]] as const;

  const base = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return inTab(tab).filter((r) => !q || r.name.toLowerCase().includes(q) || (r.symbol ?? "").toLowerCase().includes(q));
  });
  const boardCount = (k: string) => (k === "all" ? base.length : base.filter((r) => boardKey(r) === k).length);
  const shown = $derived.by(() => {
    const list = base.filter((r) => board === "all" || boardKey(r) === board);
    const by = SORTS[tab.key].find((s) => s.key === sortKey)?.by;
    return by ? [...list].sort(by) : list;
  });
  const olderListed = $derived(rows.filter((r) => r.stage === "listed" && !recent(r)).length);

  const short = (iso: string | null | undefined) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }) : "TBA");
  const stamp = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) : "");
  const times = (v: number | null | undefined) => (v == null ? "—" : `${v >= 100 ? v.toFixed(0) : v.toFixed(2)}×`);
  const money = (v: number | null | undefined) => (v == null ? "—" : `${v < 0 ? "−" : ""}₹${Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
  const size = (v: number | null | undefined) => (v == null ? "—" : `₹${v >= 100 ? Math.round(v).toLocaleString("en-IN") : v.toFixed(2)} Cr`);
  const signed = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}%`);
  const band = (r: any) => (r.price_high == null ? "TBA" : r.price_low != null && r.price_low !== r.price_high ? `₹${int(r.price_low)} – ₹${int(r.price_high)}` : `₹${int(r.price_high)}`);
  const sooner = (word: string, iso: string) => { const n = daysTo(iso); return n <= 0 ? `${word} today` : n === 1 ? `${word} tomorrow` : `${word} in ${n} days`; };

  /** Where the issue stands, in the words a reader wants first. */
  const badge = (r: any): { text: string; cls: string } => {
    if (r.stage === "open" || r.stage === "closing") { const urgent = r.close && daysTo(r.close) <= 1; return { text: r.close ? sooner("Closes", r.close) : "Open", cls: urgent ? "urgent" : "live" }; }
    if (r.stage === "upcoming") return { text: r.open ? sooner("Opens", r.open) : "Dates awaited", cls: "plain" };
    if (r.allotment && r.allotment > today) return { text: `Allotment ${short(r.allotment)}`, cls: "plain" };
    return { text: r.listing ? `Lists ${short(r.listing)}` : "Awaiting listing", cls: "plain" };
  };
  /** What the multiple means, for someone meeting the word "subscribed" for the first time. */
  const reading = (v: number | null | undefined) => (v == null ? null : v >= 1 ? `Bids for ${v >= 100 ? v.toFixed(0) : v.toFixed(2)} times the shares on offer` : `Bids for ${Math.round(v * 100)}% of the shares on offer`);

  // Refreshes while the tab is visible; the API decides how often a source is really asked.
  let refreshedAt = $state(Date.now());
  $effect(() => {
    const t = setInterval(async () => { if (document.visibilityState === "visible") { await invalidateAll(); refreshedAt = Date.now(); } }, 60_000);
    return () => clearInterval(t);
  });
  const source = $derived(d?.sources?.ipoguru);
  const sebi = $derived(d?.sources?.sebi);
  const directory = $derived([
    ["Open IPOs", rows.filter((r) => r.stage === "open" || r.stage === "closing")],
    ["Upcoming IPOs", rows.filter((r) => r.stage === "upcoming")],
    ["Closed IPOs", rows.filter((r) => r.stage === "closed" || r.stage === "allotted")],
    ["Recently listed IPOs", rows.filter((r) => r.stage === "listed").sort(latest("listing")).slice(0, 10)],
  ].filter(([, l]) => (l as any[]).length) as [string, any[]][]);
</script>

<svelte:head>
  <title>IPO GMP & Live Subscription: Mainboard and SME — {BRAND}</title>
  <meta name="description" content="Grey-market premium and live subscription for every mainboard and SME IPO on NSE and BSE, with lot costs, dates and listing performance." />
</svelte:head>

{#snippet who(r: any)}
  <span class="who">
    <IpoLogo src={r.logo} name={r.name} size={34} />
    {#if r.filing}<a href={r.filing.url} target="_blank" rel="noopener">{r.name}</a>{:else}<a href="/ipos/{r.slug}">{r.name}</a>{/if}
  </span>
{/snippet}

<div class="page">
  <p class="crumbs"><a href="/">Home</a> › IPO</p>
  <header class="head">
    <div>
      <h1>IPO Dashboard</h1>
      <p class="stamp">Checked {stamp(new Date(refreshedAt).toISOString())}{#if source?.fetched_at}. Grey-market premiums read {fetchedAt(source.fetched_at)}{/if}.</p>
    </div>
    <div class="controls">
      <input class="find" type="search" placeholder="Search for any IPO" aria-label="Search for any IPO" bind:value={search} />
      <select aria-label="Board" bind:value={board}>
        {#each BOARDS as [k, label]}<option value={k}>{label} ({boardCount(k)})</option>{/each}
      </select>
      <select aria-label="Sort" value={sortKey} onchange={(e) => (sorts[tab.key] = e.currentTarget.value)}>
        {#each SORTS[tab.key] as s}<option value={s.key}>{s.label}</option>{/each}
      </select>
    </div>
  </header>

  {#if !d}
    <div class="notice">IPO data is not reachable right now. Try again shortly.</div>
  {:else}
    <nav class="stages" aria-label="IPOs by stage">
      {#each TABS as t}
        <a href="?tab={t.key}" class:active={tab.key === t.key} aria-current={tab.key === t.key ? "page" : undefined} data-sveltekit-noscroll data-sveltekit-replacestate>{t.label}<b>{counts[t.key]}</b></a>
      {/each}
    </nav>

    <section aria-labelledby="stage-heading">
      <h2 id="stage-heading">{tab.heading}{#if tab.key === "listed" && !allListed}, last month{/if} <small>{shown.length}</small></h2>

      {#if !shown.length}
        <p class="empty">{search.trim() || board !== "all" ? "No IPO here matches this search." : tab.empty}</p>
      {:else if tab.key === "listed"}
        <div class="table-scroll tbl">
          <table>
            <thead><tr><th class="co">Company</th><th class="left">Listed</th><th>Issue price</th><th>Listing price</th><th>Listing gain</th><th>Latest</th><th>Since issue</th><th>Subscribed</th><th>Issue size</th></tr></thead>
            <tbody>
              {#each shown as r (r.slug)}
                <tr>
                  <td class="co">{@render who(r)}</td>
                  <td class="left">{short(r.listing)}</td>
                  <td>{money(r.price_high)}</td>
                  <td>{money(r.listing_price)}</td>
                  <td class="strong {tone(r.listing_gain)}">{signed(r.listing_gain)}</td>
                  <td>{money(r.cmp)}</td>
                  <td class="strong {tone(r.current_gain)}">{signed(r.current_gain)}</td>
                  <td class:up={(r.times_total ?? 0) >= 1}>{times(r.times_total)}</td>
                  <td>{size(r.size_cr)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if olderListed}
          <button class="more" onclick={() => (allListed = !allListed)}>{allListed ? "Show the last month only" : `Show ${olderListed} more from the last three months`}</button>
        {/if}
      {:else if tab.key === "expected"}
        <div class="table-scroll tbl">
          <table>
            <thead><tr><th class="co">Company</th><th class="left">Draft filed with SEBI</th><th class="left">Type</th><th class="left">Exchange</th><th>GMP</th><th class="left">Status</th></tr></thead>
            <tbody>
              {#each shown as r (r.slug)}
                <tr><td class="co">{@render who(r)}</td><td class="left">{#if r.filing}<a class="filing" href={r.filing.url} target="_blank" rel="noopener">{r.filing.doc}, {date(r.filing.filed)}</a>{:else}—{/if}</td><td class="left">{r.board}</td><td class="left">{r.exchange ?? "—"}</td><td class={tone(r.gmp)}>{money(r.gmp)}</td><td class="left"><span class="badge plain">Dates awaited</span></td></tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if shown.some((r) => r.filing)}
          <p class="sub source">Companies with a draft offer document on <a href="https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&ssid=15&smid=10" target="_blank" rel="noopener">SEBI's public issue filings</a>{#if sebi?.fetched_at}, read {fetchedAt(sebi.fetched_at)}{/if}. A draft does not mean an IPO will follow: it can be returned, withdrawn or left to lapse, and this list can't always show that. The list starts from recent filings, so it isn't every company with a draft on file.</p>
        {/if}
      {:else}
        <div class="issues">
          {#each shown as r (r.slug)}
            {@const b = badge(r)}
            <article class="issue">
              <header>
                <IpoLogo src={r.logo} name={r.name} size={48} />
                <div class="title">
                  <h3><a href="/ipos/{r.slug}">{r.name}</a></h3>
                  <p class="tags"><span>{r.board}</span>{#if r.exchange}{r.exchange.replace(/\s*SME$/i, "")}{/if}</p>
                </div>
                <span class="badge {b.cls}">{b.text}</span>
              </header>
              <dl class="facts">
                <div><dt>Open</dt><dd>{short(r.open)}</dd></div>
                <div><dt>Close</dt><dd>{short(r.close)}</dd></div>
                <div><dt>Listing</dt><dd>{short(r.listing)}</dd></div>
                <div><dt>Issue size</dt><dd>{size(r.size_cr)}</dd></div>
                <div><dt>Price band</dt><dd>{band(r)}</dd></div>
                <div><dt>Lot size</dt><dd>{r.lot ? int(r.lot) : "TBA"}</dd></div>
              </dl>
              {#if r.costs}<p class="lot">One lot at the top of the band costs <b>{money(r.costs.lot_cost)}</b></p>{/if}
              <div class="reads">
                <div>
                  <span class="k">Subscribed</span>
                  <b class="fig" class:up={(r.times_total ?? 0) >= 1}>{r.stage === "upcoming" ? "—" : times(r.times_total)}</b>
                  {#if r.qib != null || r.nii != null || r.retail != null}
                    <span class="split">QIB <b>{times(r.qib)}</b> NII <b>{times(r.nii)}</b> Retail <b>{times(r.retail)}</b></span>
                  {/if}
                  <span class="plainly">{r.stage === "upcoming" ? "Bidding hasn't started" : reading(r.times_total) ?? "No figure yet"}</span>
                </div>
                <div>
                  <span class="k">Grey market premium</span>
                  {#if r.gmp == null}
                    <b class="fig quiet">—</b><span class="plainly">Not quoted yet</span>
                  {:else}
                    <b class="fig {tone(r.gmp)}">{money(r.gmp)}{#if r.gmp_pct != null}<small>{signed(r.gmp_pct)}</small>{/if}</b>
                    {#if r.est_listing != null}<span class="split">Implies <b>{money(r.est_listing)}</b></span>{/if}
                    <span class="plainly">Unofficial{#if r.gmp_updated}, read {stamp(r.gmp_updated)}{/if}</span>
                  {/if}
                </div>
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </section>

    {#if directory.length}
      <section class="directory" aria-labelledby="directory-heading">
        <h2 id="directory-heading">IPO directory</h2>
        <div class="dir-cols">
          {#each directory as [title, list]}
            <div><h3>{title}</h3><ul>{#each list as r (r.slug)}<li><a href="/ipos/{r.slug}">{r.name} IPO</a></li>{/each}</ul></div>
          {/each}
        </div>
      </section>
    {/if}

    {#if source?.error || !source?.connected}
      <p class="sub warn">{!source?.connected ? "The IPO calendar is not connected, so only issues on NSE's board are listed." : `Showing the last stored premiums: ${source.error}.`}</p>
    {/if}
    <p class="sub source">
      IPO data by <a href="https://www.ipoguru.in/">IPO Guru</a>, with bids from NSE where it publishes the issue and draft filings from <a href="https://www.sebi.gov.in/filings/public-issues.html" target="_blank" rel="noopener">SEBI</a>. Grey-market premium is unofficial, indicative data from unregulated dealers and is not a forecast. Nothing here is investment advice; read the prospectus before applying.
    </p>
  {/if}
</div>

<style>
  .page { gap: 22px; }
  .crumbs { margin: 0 0 -14px; color: var(--ink-3); font-size: 13px; }
  .crumbs a:hover { color: var(--ink); }
  .head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 16px 28px; }
  .stamp { margin: 10px 0 0; color: var(--ink-3); font-size: 13px; }
  .controls { display: flex; flex-wrap: wrap; gap: 8px; }
  .controls input, .controls select { height: 38px; padding: 0 10px; border: 1px solid var(--line-2); border-radius: var(--radius-s); background: var(--paper-hi); color: var(--ink); font: 500 14px var(--font); }
  .controls input:hover, .controls select:hover { border-color: var(--ink); }
  .find { width: 240px; }

  .stages { display: grid; grid-template-columns: repeat(5, 1fr); border: 1.5px solid var(--ink); border-radius: var(--radius-s); }
  .stages a { display: flex; justify-content: center; align-items: baseline; gap: 8px; padding: 12px 6px; font: 750 15px var(--font); font-stretch: 82%; color: var(--ink-2); transition: background 0.15s var(--ease), color 0.15s var(--ease); }
  .stages a + a { border-left: 1px solid var(--line-2); }
  .stages a b { font-weight: 600; font-size: 13px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
  .stages a:hover { background: var(--panel-2); color: var(--ink); }
  .stages a.active { background: var(--ink); color: var(--on-ink); }
  .stages a.active b { color: inherit; }

  section > h2 { margin-bottom: 14px; font-size: 22px; font-weight: 850; font-stretch: 72%; }
  section > h2 small { margin-left: 4px; font: 500 14px var(--font); color: var(--ink-3); font-variant-numeric: tabular-nums; }
  .empty { padding: 34px 20px; border: 1px solid var(--line-2); font-family: var(--serif); color: var(--ink-2); text-align: center; }

  .issues { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 400px), 1fr)); gap: 16px; }
  .issue { position: relative; display: flex; flex-direction: column; border: 1px solid var(--line-2); border-top: 3px solid var(--ink); transition: border-color 0.15s var(--ease); }
  .issue:hover { border-color: var(--ink); }
  .issue:hover h3 a { text-decoration: underline; }
  .issue header { display: flex; align-items: center; gap: 12px; padding: 16px 16px 12px; }
  .title { min-width: 0; flex: 1; }
  h3 { font-size: 21px; font-weight: 850; font-stretch: 72%; line-height: 1.1; }
  h3 a::after { content: ""; position: absolute; inset: 0; } /* the whole card opens the issue */
  .tags { display: flex; align-items: center; gap: 7px; margin: 5px 0 0; font-size: 12.5px; color: var(--ink-3); }
  .tags span { padding: 0 6px; border: 1px solid var(--line-2); border-radius: var(--radius-s); color: var(--ink-2); font-weight: 600; }
  .badge { flex: none; align-self: flex-start; padding: 2px 8px; border-radius: var(--radius-s); font-size: 12.5px; font-weight: 700; font-stretch: 88%; white-space: nowrap; }
  .badge.urgent { background: var(--warn-soft); color: var(--warn); }
  .badge.live { background: var(--up-soft); color: var(--up); }
  .badge.plain { background: var(--panel-2); color: var(--ink-2); }
  .facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 10px; margin: 0; padding: 4px 16px 14px; }
  dt, .k { display: block; font-size: 11px; font-weight: 700; font-stretch: 82%; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-3); }
  dd { margin: 3px 0 0; font-weight: 650; font-size: 15px; font-stretch: 88%; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .lot { margin: 0; padding: 0 16px 14px; font-size: 13px; color: var(--ink-2); }
  .lot b { color: var(--ink); font-variant-numeric: tabular-nums; }
  .reads { display: grid; grid-template-columns: 1fr 1fr; margin-top: auto; background: var(--panel-2); border-top: 1px solid var(--line); }
  .reads > div { display: grid; align-content: start; gap: 4px; padding: 14px 16px; min-width: 0; }
  .reads > div + div { border-left: 1px solid var(--line); }
  .fig { font: 850 30px/1.05 var(--display); font-stretch: 72%; font-variant-numeric: tabular-nums; }
  .fig small { margin-left: 6px; font: 600 14px var(--font); font-stretch: 85%; }
  .fig.quiet { color: var(--ink-3); }
  .split { font-size: 12.5px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
  .split b { margin-right: 5px; color: var(--ink); font-weight: 650; }
  .plainly { font-family: var(--serif); font-size: 13px; line-height: 1.35; color: var(--ink-2); }
  .up { color: var(--up); } .down { color: var(--down); }

  .tbl { border-top: 3px solid var(--ink); }
  .tbl table { min-width: 840px; }
  .tbl td { height: 56px; }
  .tbl tbody tr:hover td { background: var(--panel-2); }
  .tbl td.strong { font-weight: 700; }
  th.co, td.co { position: sticky; left: 0; z-index: 2; background: var(--bg); text-align: left; min-width: 240px; white-space: normal; }
  .who { display: flex; align-items: center; gap: 10px; }
  .who a { font-weight: 650; font-stretch: 92%; line-height: 1.2; }
  .who a:hover { text-decoration: underline; }
  .more { margin-top: 14px; padding: 9px 14px; border: 1px solid var(--line-2); border-radius: var(--radius-s); background: none; color: var(--ink); font: 650 14px var(--font); cursor: pointer; }
  .more:hover { background: var(--panel-2); border-color: var(--ink); }

  .directory { padding-top: 14px; border-top: 3px solid var(--ink); }
  .dir-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 20px 28px; }
  .directory h3 { margin-bottom: 8px; font-size: 13px; font-weight: 750; font-stretch: 82%; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-3); }
  .directory ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; font-size: 14px; }
  .directory a:hover { text-decoration: underline; }
  .source { font-size: 12.5px; line-height: 1.55; }
  .filing { text-decoration: underline; }
  .source a { text-decoration: underline; }
  .warn { color: var(--ink-2); font-size: 13px; }

  @media (max-width: 640px) {
    .controls, .find { width: 100%; }
    .controls select { flex: 1; min-width: 0; }
    .stages a { flex-direction: column; align-items: center; gap: 1px; padding: 9px 2px; font-size: 13px; }
    .tbl table { min-width: 720px; }
    th.co, td.co { min-width: 160px; max-width: 170px; }
    .reads > div { padding: 12px; }
    .fig { font-size: 26px; }
  }
</style>
