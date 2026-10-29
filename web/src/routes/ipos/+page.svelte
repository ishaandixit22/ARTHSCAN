<script lang="ts">
  import { BRAND } from "$lib/brand";
  import { cr, date, fetchedAt, int, pct, price, tone } from "$lib/format";

  let { data } = $props();
  const ipo = $derived(data.ipo);
  const board = $derived(data.board);
  const TABS = [
    { key: "active", label: "Open now" },
    { key: "upcoming", label: "Upcoming" },
    { key: "closed", label: "Awaiting listing" },
    { key: "listed", label: "Recently listed" },
  ];
  const open = $derived((board?.open ?? []).filter((x: any) => x.status === "open"));
  const closed = $derived((board?.open ?? []).filter((x: any) => x.status === "closed"));
  // Issues the provider lists as open that NSE's board does not carry (mostly BSE-only SMEs): shown plainly, without subscription.
  const onBoard = $derived(new Set((board?.open ?? []).map((x: any) => x.symbol)));
  const others = $derived(board ? (ipo.data?.active ?? []).filter((r: any) => !onBoard.has(r.symbol)) : []);
  const count = (k: string) => (k === "active" && board ? open.length + others.length : k === "closed" && board ? closed.length : (ipo.data?.[k]?.length ?? 0));

  // The list for the plainer tabs: NSE's own board when it answered, the provider's list otherwise.
  const rows = $derived.by(() => {
    const list = [...(ipo.data?.[data.tab] ?? [])];
    if (data.tab === "listed") list.sort((a, b) => (b.listing_date ?? "").localeCompare(a.listing_date ?? ""));
    return data.tab === "listed" ? list.slice(0, 60) : list;
  });
  const band = (r: any) => (!r.max_price ? "—" : r.min_price && r.min_price !== r.max_price ? `${price(r.min_price)} – ${price(r.max_price)}` : price(r.max_price));
  const dates = (r: any) => (r.bidding_start_date ? `${date(r.bidding_start_date)} – ${date(r.bidding_end_date)}` : "—");
  const bandNse = (r: any) => (!r.price_high ? "—" : r.price_low && r.price_low !== r.price_high ? `${price(r.price_low)} – ${price(r.price_high)}` : price(r.price_high));

  // An issue that opens today can lack its lot on NSE's board: borrow the provider's lot for a plain one-lot cost.
  const providerLot = (r: any) => (ipo.data?.active ?? []).find((x: any) => x.symbol === r.symbol)?.lot_size ?? null;
  const SHOWN = ["qib", "snii", "bnii", "retail", "total"];
  const sub = (r: any) => (r.subscription ?? []).filter((c: any) => SHOWN.includes(c.key));
  const cost = (v: number | null | undefined) => (v == null ? "—" : v >= 1e7 ? `₹${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `₹${(v / 1e5).toFixed(2)} L` : price(v));
  const chance = (v: number) => (v >= 1 ? "100%" : v < 0.1 ? `${(v * 100).toFixed(1)}%` : `${Math.round(v * 100)}%`);
  const ago = (v: number | null | undefined) => (v == null ? "—" : `${v >= 100 ? v.toFixed(0) : v.toFixed(2)}×`);

  let budget = $state("");
  const amount = $derived(Number(budget.replace(/[^\d]/g, "")) || 0);
  const fit = (r: any) => {
    if (!amount || !r.costs) return null;
    const lots = Math.floor(amount / r.costs.lot_cost);
    if (!lots) return { lots: 0, text: `Below one lot (${cost(r.costs.lot_cost)})` };
    const who = lots * r.costs.lot_cost <= 2e5 ? "Retail" : lots * r.costs.lot_cost <= 1e6 ? "sNII" : "bNII";
    return { lots, text: `${lots} lot${lots > 1 ? "s" : ""} · ${cost(lots * r.costs.lot_cost)} · ${who}` };
  };
  const journey = (r: any) => {
    const nowPx = data.now[r.symbol];
    return { nowPx, sinceIssue: nowPx && r.max_price ? ((nowPx - r.max_price) / r.max_price) * 100 : null };
  };
</script>

<svelte:head><title>IPOs — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>IPOs</h1>
      <p class="sub">
        Mainboard and SME issues on NSE and BSE{#if data.tab === "active" && board}{" · live subscription from NSE, as of "}{fetchedAt(board.as_of)}{:else if ipo.fetched_at}{" · fetched "}{fetchedAt(ipo.fetched_at)}{/if}.
      </p>
    </div>
    <div class="tabs">
      {#each TABS as t}
        <a href="?tab={t.key}" class:active={data.tab === t.key} data-sveltekit-noscroll>{t.label} <span class="n">{count(t.key)}</span></a>
      {/each}
    </div>
  </div>

  {#if data.tab === "active" && board}
    <label class="budget">
      <span>I have</span>
      <input inputmode="numeric" placeholder="₹ 15,000" bind:value={budget} aria-label="Amount you want to invest" />
      <span class="hint">see how many lots fit in each issue, and which investor bracket that makes you</span>
    </label>
    {#if !open.length}
      <div class="card empty">No IPO is open for bidding right now. See Upcoming.</div>
    {/if}
    <div class="grid">
      {#each open as r (r.symbol)}
        {@const f = fit(r)}
        <article class="card ipo">
          <header>
            <div>
              <h2><a href="/ipos/{r.symbol}">{r.name}</a>{#if r.sme} <span class="chip">SME</span>{/if}</h2>
              <p class="meta">{r.symbol} · {bandNse(r)} · {date(r.start)} – {date(r.end)}</p>
            </div>
            <span class="chip" class:up={r.days_left === 0}>{r.days_left === 0 ? "Closes today" : r.days_left === 1 ? "Closes tomorrow" : `${r.days_left} days left`}</span>
          </header>

          {#if r.costs}
            <dl class="costs">
              <div><dt>One lot ({int(r.costs.lot_size)} shares)</dt><dd>{cost(r.costs.lot_cost)}</dd></div>
              <div><dt>Retail, up to</dt><dd>{r.costs.retail_max_lots} lot{r.costs.retail_max_lots > 1 ? "s" : ""} · {cost(r.costs.retail_max_cost)}</dd></div>
              <div><dt>sNII from</dt><dd>{r.costs.snii_min_lots} lots · {cost(r.costs.snii_min_cost)}</dd></div>
              <div><dt>bNII from</dt><dd>{r.costs.bnii_min_lots} lots · {cost(r.costs.bnii_min_cost)}</dd></div>
            </dl>
          {/if}
          {#if !r.costs && providerLot(r) && r.price_high}
            <dl class="costs"><div><dt>One lot ({int(providerLot(r))} shares)</dt><dd>{cost(providerLot(r) * r.price_high)}</dd></div></dl>
          {/if}
          {#if f}<p class="fit" class:warn={!f.lots}>With ₹{int(amount)}: {f.text}</p>{/if}

          {#if sub(r).length}
            <div class="subs">
              {#each sub(r) as c (c.key)}
                <div class="sub-row" class:total={c.key === "total"}>
                  <span class="lbl">{c.label}</span>
                  <span class="track" title="{c.times ?? 0} times subscribed"><i class:full={(c.times ?? 0) >= 1} style="width: {Math.min(100, (c.times ?? 0) * 100)}%"></i></span>
                  <span class="val">{ago(c.times)}</span>
                </div>
              {/each}
            </div>
            <p class="facts">
              {#if r.demand_cr != null}Demand <b>{cr(r.demand_cr)}</b> at the top of the band{/if}
              {#if r.retail_odds}· Retail chance about <b>{chance(r.retail_odds.chance)}</b> <span class="est">(estimate, if each applicant bids one lot)</span>{/if}
            </p>
          {:else}
            <p class="facts">NSE has not published bids for this issue yet. It usually appears once bidding starts.</p>
          {/if}

          <p class="facts">
            {#if r.dates?.allotment_est}Allotment about <b>{date(r.dates.allotment_est)}</b>{/if}
            {#if r.dates?.lockin_50pct}· Anchor lock-in ends {date(r.dates.lockin_50pct)} (50%) and {date(r.dates.lockin_rest)} (rest){/if}
          </p>
          {#if r.gmp != null}
            <div class="gmpbox">
              <div><span class="k">Grey-market premium</span><b class={tone(r.gmp)}>{r.gmp >= 0 ? "+" : "−"}₹{Math.abs(r.gmp)}</b> <span class={tone(r.gmp)}>({pct(r.gmp_pct)})</span></div>
              <div><span class="k">Profit per lot</span><b class={tone(r.profit_per_lot)}>{r.profit_per_lot >= 0 ? "+" : "−"}₹{int(Math.abs(r.profit_per_lot))}</b></div>
              <div><span class="k">Implied listing</span><b>{price(r.est_listing)}</b></div>
              <p>Median of grey-market sources{#if r.gmp_change_24h != null}, {r.gmp_change_24h === 0 ? "unchanged in 24 hours" : `${r.gmp_change_24h > 0 ? "up" : "down"} ₹${Math.abs(r.gmp_change_24h)} in 24 hours`}{/if}. Unofficial and can be wrong; it is not a forecast.</p>
            </div>
          {/if}
          <p class="foot">
            {#if r.gmp == null}<span class="gmp">{board.gmp?.connected ? (board.gmp.error ? `Grey-market premium unavailable: ${board.gmp.error}` : "No grey-market premium reported yet") : "Grey-market premium: not connected yet"}</span>{/if}
            <a href="/ipos/{r.symbol}">Full details →</a>
            {#if r.rhp_url}<a href={r.rhp_url} target="_blank" rel="noopener noreferrer">Prospectus (RHP)</a>{/if}
            {#if r.data_as_of}<span class="asof">{r.data_as_of.replace("Updated as on ", "NSE: ")}</span>{/if}
          </p>
        </article>
      {/each}
    </div>
    {#if others.length}
      <h3 class="more">Also open, not on NSE's live board <span class="hint">mostly BSE SME issues: dates and prices only, no subscription data</span></h3>
      <section class="card">
        <div class="table-scroll">
          <table>
            <thead><tr><th>Issue</th><th>Price band</th><th class="wide-only">Lot</th><th>Bidding</th><th>Listing</th></tr></thead>
            <tbody>
              {#each others as r (r.symbol + r.name)}
                <tr>
                  <td><span class="sym">{r.name}</span>{#if r.is_sme} <span class="chip">SME</span>{/if}<span class="name">{r.symbol}{#if r.document_url} · <a href={r.document_url} target="_blank" rel="noopener noreferrer">prospectus</a>{/if}</span></td>
                  <td>{band(r)}</td><td class="wide-only">{int(r.lot_size)}</td><td>{dates(r)}</td><td>{date(r.listing_date)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}
  {:else if data.tab === "closed" && board && closed.length}
    <section class="card">
      <div class="table-scroll">
        <table>
          <thead><tr><th>Issue</th><th>Price band</th><th>Closed</th><th>Subscribed</th><th class="wide-only">Retail</th><th class="wide-only">QIB</th><th class="wide-only">NII</th><th>Allotment (est.)</th></tr></thead>
          <tbody>
            {#each closed as r (r.symbol)}
              {@const by = Object.fromEntries((r.subscription ?? []).map((c: any) => [c.key, c]))}
              <tr>
                <td><a class="sym" href="/ipos/{r.symbol}">{r.name}</a>{#if r.sme} <span class="chip">SME</span>{/if}<span class="name">{r.symbol}{#if r.rhp_url} · <a href={r.rhp_url} target="_blank" rel="noopener noreferrer">prospectus</a>{/if}</span></td>
                <td>{bandNse(r)}</td><td>{date(r.end)}</td>
                <td>{ago(r.times_total)}</td>
                <td class="wide-only">{ago(by.retail?.times)}</td><td class="wide-only">{ago(by.qib?.times)}</td><td class="wide-only">{ago(by.nii?.times)}</td>
                <td>{date(r.dates?.allotment_est)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {:else if data.tab === "upcoming" && board?.upcoming?.length}
    <section class="card">
      <div class="table-scroll">
        <table>
          <thead><tr><th>Issue</th><th>Price band</th><th>Opens</th><th>Closes</th><th class="wide-only">One lot</th></tr></thead>
          <tbody>
            {#each board.upcoming as r (r.symbol)}
              <tr>
                <td><a class="sym" href="/ipos/{r.symbol}">{r.name}</a>{#if r.sme} <span class="chip">SME</span>{/if}<span class="name">{r.symbol}</span></td>
                <td>{bandNse(r)}</td><td>{date(r.start)}</td><td>{date(r.end)}</td>
                <td class="wide-only">{r.costs ? `${cost(r.costs.lot_cost)} (${int(r.costs.lot_size)} sh)` : "—"}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {:else if ipo.error}
    <div class="notice">{ipo.error}</div>
  {:else if !rows.length}
    <div class="card empty">No IPOs in this list right now.</div>
  {:else}
    <section class="card">
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Issue</th><th>Price band</th><th class="wide-only">Lot</th>
              {#if data.tab === "listed"}<th>Listed</th><th>Listing price</th><th>Listing gain</th><th>Now</th><th>Since issue</th>
              {:else}<th>Bidding</th><th>Listing</th>{/if}
              {#if data.tab !== "listed"}<th class="left wide-only">Note</th>{/if}
            </tr>
          </thead>
          <tbody>
            {#each rows as r (r.symbol + r.name)}
              {@const j = data.tab === "listed" ? journey(r) : null}
              <tr>
                <td>
                  <span class="sym">{r.name}</span>{#if r.is_sme} <span class="chip">SME</span>{/if}
                  <span class="name">{r.symbol}{#if r.document_url} · <a href={r.document_url} target="_blank" rel="noopener noreferrer">prospectus</a>{/if}</span>
                </td>
                <td>{band(r)}</td>
                <td class="wide-only">{int(r.lot_size)}</td>
                {#if data.tab === "listed"}
                  <td>{date(r.listing_date)}</td>
                  <td>{price(r.listing_price)}</td>
                  <td class={tone(r.listing_gains)}>{pct(r.listing_gains)}</td>
                  <td>{price(j?.nowPx)}</td>
                  <td class={tone(j?.sinceIssue)}>{pct(j?.sinceIssue)}</td>
                {:else}
                  <td>{dates(r)}</td>
                  <td>{date(r.listing_date)}</td>
                {/if}
                {#if data.tab !== "listed"}<td class="left wide-only note">{r.additional_text ?? ""}</td>{/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
  <p class="sub source">
    Subscription, lot and price data: NSE{#if board?.gmp?.connected}; grey-market premium: ipoalerts.in{/if}{#if !board || data.tab !== "active"}; dates and listings: Indian Stock API{/if}. Chances, lock-in dates and bracket sizes are estimates from the published numbers, not advice or forecasts. Check the prospectus and exchange notices before applying.
  </p>
</div>

<style>
  .n { color: var(--ink-3); font-size: 12px; margin-left: 2px; }
  .note { color: var(--ink-3); font-size: 13px; white-space: normal; min-width: 180px; }
  .name a { text-decoration: underline; }
  .source { font-size: 12.5px; margin-top: 16px; }
  .budget { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 0 0 16px; color: var(--ink-2); font-size: 14px; }
  .budget input { width: 150px; padding: 7px 10px; border: 1px solid var(--line-2); border-radius: 8px; background: var(--panel); color: var(--ink); font: inherit; }
  .more { font-size: 15px; margin: 24px 0 10px; }
  .more .hint { margin-left: 8px; font-weight: 400; }
  .hint { color: var(--ink-3); font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 460px), 1fr)); gap: 16px; }
  .ipo { padding: 18px; display: flex; flex-direction: column; gap: 12px; }
  .ipo header { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
  .ipo h2 { font-size: 17px; margin: 0; }
  .ipo h2 a:hover, a.sym:hover { text-decoration: underline; }
  .meta { color: var(--ink-3); font-size: 13px; margin: 3px 0 0; }
  .costs { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; margin: 0; }
  .costs dt { color: var(--ink-3); font-size: 12px; }
  .costs dd { margin: 2px 0 0; font-variant-numeric: tabular-nums; font-weight: 600; }
  .fit { margin: 0; padding: 8px 10px; border-radius: 8px; background: var(--up-soft); font-size: 13.5px; }
  .fit.warn { background: var(--panel-2); color: var(--ink-2); }
  .subs { display: grid; gap: 7px; }
  .sub-row { display: grid; grid-template-columns: 138px 1fr 62px; gap: 10px; align-items: center; font-size: 13px; }
  .sub-row.total { padding-top: 6px; border-top: 1px solid var(--line); font-weight: 600; }
  .lbl { color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .track { height: 8px; border-radius: 4px; background: var(--panel-2); overflow: hidden; }
  .track i { display: block; height: 100%; background: var(--ink-3); border-radius: 4px; }
  .track i.full { background: var(--up); }
  .val { text-align: right; font-variant-numeric: tabular-nums; }
  .facts { margin: 0; color: var(--ink-2); font-size: 13px; line-height: 1.5; }
  .gmpbox { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 14px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; font-variant-numeric: tabular-nums; }
  .gmpbox .k { display: block; color: var(--ink-3); font-size: 12px; }
  .gmpbox p { grid-column: 1 / -1; margin: 0; color: var(--ink-3); font-size: 12px; }
  .est { color: var(--ink-3); }
  .foot { margin: 0; display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12.5px; color: var(--ink-3); }
  .foot a { text-decoration: underline; }
  @media (max-width: 640px) {
    .wide-only { display: none; }
    tbody td:first-child { white-space: normal; min-width: 140px; max-width: 170px; }
    .sub-row { grid-template-columns: 110px 1fr 54px; }
  }
</style>
