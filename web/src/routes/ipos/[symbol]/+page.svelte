<script lang="ts">
  import { BRAND } from "$lib/brand";
  import { date, fetchedAt, int, pct, price, tone } from "$lib/format";

  let { data } = $props();
  const o = $derived(data.ipo);
  const by = $derived(Object.fromEntries(o.subscription.map((r: any) => [r.key, r])));
  const cr = (v: number | null | undefined) => (v == null ? "—" : `₹${Math.round(v).toLocaleString("en-IN")} Cr`);
  const times = (v: number | null | undefined) => (v == null ? "—" : `${v.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}×`);
  const amt = (v: number | null | undefined) => (v == null ? "—" : v >= 1e7 ? `₹${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `₹${(v / 1e5).toFixed(2)} lakh` : price(v));
  const chance = (v: number) => (v >= 1 ? "100%" : v < 0.1 ? `${(v * 100).toFixed(1)}%` : `${Math.round(v * 100)}%`);
  const sh = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-IN"));
  const rupee = (v: number | null | undefined) => (v == null ? "—" : `${v < 0 ? "−" : ""}₹${Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
  const band = $derived(!o.price_high ? "—" : o.price_low && o.price_low !== o.price_high ? `${price(o.price_low)} – ${price(o.price_high)}` : price(o.price_high));
  const stateLabel = $derived(o.status === "open" ? "Open for bidding" : o.status === "upcoming" ? "Opens soon" : "Bidding closed");

  const TABS = [
    ["overview", "Overview"], ["subscription", "Subscription"], ["gmp", "GMP"], ["bids", "Bids received"], ["details", "IPO details"],
    ["reservation", "Reservation & lots"], ["anchor", "Anchor"], ["about", "About"], ["faq", "FAQ"],
  ];
  const tabs = $derived(TABS.filter(([k]) => (k === "anchor" ? !!o.anchor : k === "about" ? !!(o.about || o.strengths.length || o.risks.length) : true)));

  // GMP chart: day-wise premium, oldest to newest.
  const days = $derived([...o.gmp.days].reverse());
  const W = 640, H = 150, PAD = 10;
  const chart = $derived.by(() => {
    if (days.length < 2) return null;
    const vals = days.map((d: any) => d.gmp), lo = Math.min(0, ...vals), hi = Math.max(...vals), span = hi - lo || 1;
    const px = (i: number) => PAD + (i / (days.length - 1)) * (W - 2 * PAD);
    const py = (v: number) => H - PAD - ((v - lo) / span) * (H - 2 * PAD);
    const line = days.map((d: any, i: number) => `${i ? "L" : "M"}${px(i).toFixed(1)},${py(d.gmp).toFixed(1)}`).join("");
    const pts = days.map((d: any, i: number) => ({ x: px(i), y: py(d.gmp), d }));
    return { line, pts, area: `${line}L${px(days.length - 1)},${H - PAD}L${px(0)},${H - PAD}Z`, last: pts[pts.length - 1] };
  });

  const faq = $derived([
    [`What is the GMP of ${o.name} IPO?`, o.gmp.latest != null ? `The latest grey market premium (GMP) is ${rupee(o.gmp.latest)} per share (${pct(o.gmp.pct)}). GMP is unofficial, indicative grey-market data and not a forecast of the listing price.` : "No grey-market premium is reported for this issue right now. GMP is unofficial and not a forecast."],
    [`What is the price band of ${o.name} IPO?`, `The price band is ${band} per share.`],
    [`What is the lot size of ${o.name} IPO?`, o.costs ? `One lot is ${int(o.costs.lot_size)} shares, which costs ${price(o.costs.lot_cost)} at the top of the band.` : "The lot size has not been published yet."],
    [`When does ${o.name} IPO open and close?`, `It opens on ${date(o.dates.open)} and closes on ${date(o.dates.close)}.`],
    [`What is the listing date of ${o.name} IPO?`, `The expected listing date is ${date(o.dates.listing)}. It is tentative until the exchange confirms it.`],
    [`What is the subscription status of ${o.name} IPO?`, o.times_total != null ? `${times(o.times_total)} subscribed overall${o.data_as_of ? ` (${o.data_as_of.replace("Updated as on ", "NSE, ")})` : ""}: QIB ${times(by.qib?.times)}, NII ${times(by.nii?.times)}, retail ${times(by.retail?.times)}.` : "Bidding has not started, or NSE has not published bids yet."],
  ]);
</script>

<svelte:head><title>{o.name} IPO GMP, Subscription & Price Band — {BRAND}</title></svelte:head>

<div class="page">
  <p class="crumbs"><a href="/">Home</a> › <a href="/ipos">IPOs</a> › {o.name}</p>
  <nav class="subnav tabs" aria-label="Sections">
    {#each tabs as [k, label]}<a href="#{k}">{label}</a>{/each}
  </nav>

  <section id="overview" class="card hero">
    <div class="who">
      {#if o.logo}<img src={o.logo} alt="" width="56" height="56" loading="lazy" />{:else}<span class="mono">{o.name.slice(0, 1)}</span>{/if}
      <div>
        <h1>{o.name}</h1>
        <p class="chips">
          {#if o.issue_type}<span class="chip">{o.issue_type}</span>{/if}<span class="chip">{o.board}</span><span class="chip">{stateLabel}</span>
          {#if o.issue_size_cr != null}<span class="chip up">{cr(o.issue_size_cr)} issue</span>{/if}
        </p>
      </div>
    </div>
    <div class="big"><b class:up={(o.times_total ?? 0) >= 1}>{times(o.times_total)}</b><span>Overall subscription</span></div>
    <dl class="grid4">
      <div><dt>Price band</dt><dd>{band}</dd></div>
      <div><dt>Issue size</dt><dd>{cr(o.issue_size_cr)}</dd></div>
      <div><dt>1 lot at cut-off</dt><dd>{price(o.cut_off_cost)}</dd></div>
      <div><dt>Lot size</dt><dd>{o.costs ? int(o.costs.lot_size) : "—"} <small>shares</small></dd></div>
      <div><dt>Open</dt><dd>{date(o.dates.open)}</dd></div>
      <div><dt>Close</dt><dd>{date(o.dates.close)}</dd></div>
      <div><dt>Allotment</dt><dd>{date(o.dates.allotment)}</dd></div>
      <div><dt>Listing</dt><dd>{date(o.dates.listing)}</dd></div>
    </dl>
  </section>

  <section class="card pad">
    <header class="sec"><h2>Scheduled dates</h2><span class="muted">Tentative timetable. A past date is not confirmation the step completed.</span></header>
    <ol class="steps">
      {#each o.timeline as s}
        <li class={s.state}><i></i><b>{s.label}</b><span>{date(s.date)}</span></li>
      {/each}
    </ol>
  </section>

  <section id="subscription" class="card pad">
    <header class="sec"><h2>Subscription</h2><b class="total" class:up={(o.times_total ?? 0) >= 1}>{times(o.times_total)}<small>overall</small></b></header>
    {#if o.subscription.length}
      <ul class="rows">
        {#each [["qib", "Qualified institutional", "QIB"], ["bnii", "Big non-institutional", "bNII · above ₹10 lakh"], ["snii", "Small non-institutional", "sNII · ₹2–10 lakh"], ["retail", "Retail individual", "RII · up to ₹2 lakh"]] as [k, name, tag]}
          {#if by[k]}<li><span>{name} <em>{tag}</em></span><b class:up={(by[k].times ?? 0) >= 1}>{times(by[k].times)}</b></li>{/if}
        {/each}
      </ul>
      {#if o.retail_odds}<p class="note">Retail chance of a lot is about <b>{chance(o.retail_odds.chance)}</b>: {sh(o.retail_odds.lots_offered)} lots on offer against {sh(o.retail_odds.lots_bid)} lots bid for. An estimate that assumes each applicant bids one lot.</p>{/if}
    {:else}
      <p class="note">NSE has not published bids for this issue yet. They appear once bidding starts.</p>
    {/if}
  </section>

  <section id="gmp" class="card pad">
    <header class="sec">
      <div><h2>Grey market premium</h2><span class="muted">Unofficial and indicative, not a forecast</span></div>
      {#if o.gmp.latest != null}<div class="big sm"><b class={tone(o.gmp.latest)}>{rupee(o.gmp.latest)} <small>{pct(o.gmp.pct)}</small></b>{#if o.gmp.updated}<span>{fetchedAt(o.gmp.updated)}</span>{/if}</div>{/if}
    </header>
    {#if o.gmp.latest != null}
      <dl class="grid4 tight">
        <div><dt>Estimated listing</dt><dd>{price(o.gmp.est_listing)}</dd></div>
        <div><dt>Gain per lot</dt><dd class={tone(o.gmp.profit_per_lot)}>{rupee(o.gmp.profit_per_lot)}</dd></div>
        <div><dt>24-hour change</dt><dd class={tone(o.gmp.change_24h)}>{o.gmp.change_24h == null ? "—" : o.gmp.change_24h === 0 ? "unchanged" : rupee(o.gmp.change_24h)}</dd></div>
        <div><dt>Range · {days.length} days</dt><dd>{o.gmp.range ? `${rupee(o.gmp.range[0])} – ${rupee(o.gmp.range[1])}` : "—"}</dd></div>
      </dl>
      {#if chart}
        <svg viewBox="0 0 {W} {H}" class="chart" role="img" aria-label="Grey market premium by day, {date(days[0].date)} to {date(days[days.length - 1].date)}">
          <path d={chart.area} class="area" /><path d={chart.line} class="line" fill="none" />
          <circle cx={chart.last.x} cy={chart.last.y} r="4" class="dot" />
          {#each chart.pts as p}<circle cx={p.x} cy={p.y} r="9" fill="transparent"><title>{date(p.d.date)}: {rupee(p.d.gmp)} ({pct(p.d.pct)})</title></circle>{/each}
        </svg>
        <p class="axis"><span>{date(days[0].date)}</span><span>{date(days[days.length - 1].date)}</span></p>
      {/if}
      <details>
        <summary>Day-wise premium · {days.length} observations</summary>
        <div class="table-scroll">
          <table>
            <thead><tr><th class="left">Date</th><th>GMP</th><th>%</th><th>Est. listing</th><th>Gain / lot</th></tr></thead>
            <tbody>
              {#each o.gmp.days as d}
                <tr><td class="left">{date(d.date)}</td><td class={tone(d.gmp)}>{rupee(d.gmp)}</td><td>{pct(d.pct)}</td><td>{price(d.est_listing)}</td><td class={tone(d.gain_per_lot)}>{rupee(d.gain_per_lot)}</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      </details>
      <p class="note">Gain per lot assumes the premium holds to listing and that the application is allotted. Allotment in an oversubscribed issue is a lottery, so it is indicative, not expected.</p>
    {:else}
      <p class="note">{!o.gmp_connected ? "Grey-market premium is not connected yet." : o.gmp_error ? `Grey-market premium is unavailable: ${o.gmp_error}.` : "No grey-market premium is reported for this issue yet."}</p>
    {/if}
  </section>

  <section id="bids" class="card pad">
    <header class="sec"><h2>Bids received</h2><span class="muted">The demand behind each multiple: what was offered, what was bid for, and what those bids are worth</span></header>
    <div class="table-scroll">
      <table>
        <thead><tr><th class="left">Category</th><th>Shares offered</th><th>Shares bid for</th><th>Bids (₹ Cr)</th><th>Times</th></tr></thead>
        <tbody>
          {#each o.subscription as r}
            <tr class:tot={r.key === "total"}><td class="left" class:within={r.within}>{r.label}{#if r.within} <em>within NII</em>{/if}</td><td>{sh(r.offered)}</td><td>{sh(r.bid)}</td><td>{cr(r.bid_cr)}</td><td class:up={(r.times ?? 0) >= 1}>{times(r.times)}</td></tr>
          {:else}
            <tr><td class="left" colspan="5">No bids published yet.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="note">Times subscribed is the figure NSE publishes for each category, not shares bid for divided by shares offered. Bids in ₹ are shares bid for at the top of the price band.{#if o.data_as_of}{" "}{o.data_as_of.replace("Updated as on ", "Observed ")} IST.{/if} The registrar publishes the final basis of allotment.</p>
  </section>

  <section id="details" class="card pad">
    <header class="sec"><h2>Issue details</h2></header>
    <dl class="kv">
      <div><dt>IPO date</dt><dd>{date(o.dates.open)} – {date(o.dates.close)}</dd></div>
      <div><dt>Listing date</dt><dd>{date(o.dates.listing)}</dd></div>
      <div><dt>Face value</dt><dd>{o.facts.face_value ?? "—"}</dd></div>
      <div><dt>Price band</dt><dd>{band}</dd></div>
      <div><dt>Issue price (top of band)</dt><dd>{price(o.price_high)} per share</dd></div>
      <div><dt>Lot size</dt><dd>{o.costs ? int(o.costs.lot_size) : "—"} shares</dd></div>
      <div><dt>Issue type</dt><dd>{o.issue_type ?? "—"}</dd></div>
      <div><dt>Total issue size</dt><dd>{cr(o.issue_size_cr)}{#if o.issue_size_from === "estimate"} <small>(shares × price, approximate)</small>{/if}</dd></div>
      {#if o.facts.fresh_issue_cr != null}<div><dt>Fresh issue</dt><dd>{cr(o.facts.fresh_issue_cr)}</dd></div>{/if}
      {#if o.facts.offer_for_sale_cr != null}<div><dt>Offer for sale</dt><dd>{cr(o.facts.offer_for_sale_cr)}</dd></div>{/if}
      <div><dt>Registrar</dt><dd>{o.facts.registrar ?? "—"}</dd></div>
      <div><dt>Lead managers</dt><dd>{o.facts.lead_managers ?? "—"}</dd></div>
      {#if o.facts.sponsor_bank}<div><dt>Sponsor bank</dt><dd>{o.facts.sponsor_bank}</dd></div>{/if}
    </dl>
    {#if o.documents.length}
      <h3>Offer documents</h3>
      <ul class="docs">{#each o.documents as d}<li><a href={d.url} target="_blank" rel="noopener noreferrer">{d.label} ↗</a></li>{/each}</ul>
    {/if}
  </section>

  <section id="reservation" class="card pad">
    <header class="sec"><h2>Reservation and application size</h2><span class="muted">How the issue is split between investor categories, and what each may bid. Indented rows sit inside the category above and are not added to it.</span></header>
    {#if o.reservation.rows.length}
      <div class="table-scroll">
        <table>
          <thead><tr><th class="left">Investor category</th><th>Shares</th><th>% of net offer</th><th>% of total issue</th></tr></thead>
          <tbody>
            {#each o.reservation.rows as r}
              <tr><td class="left" class:within={r.within}>{r.label}</td><td>{sh(r.shares)}</td><td>{r.pct_net == null ? "—" : `${r.pct_net.toFixed(2)}%`}</td><td>{r.pct_total == null ? "—" : `${r.pct_total.toFixed(2)}%`}</td></tr>
            {/each}
            <tr class="tot"><td class="left">Total issue</td><td>{sh(o.reservation.total)}</td><td>—</td><td>100.00%</td></tr>
          </tbody>
        </table>
      </div>
      <p class="note">Net offer to the public: {sh(o.reservation.net)} shares{#if o.anchor}; the anchor portion is placed a day before the issue opens and sits on top of it{/if}.</p>
    {/if}
    {#if o.application && o.costs}
      <h3>Application size</h3>
      <div class="table-scroll">
        <table>
          <thead><tr><th class="left">Application</th><th>Lots</th><th>Shares</th><th>Amount</th></tr></thead>
          <tbody>
            {#each [["Retail (min)", 1], ["Retail (max)", o.application.retail_max_lots], ["sNII (min)", o.application.snii_min_lots], ["sNII (max)", o.application.snii_max_lots], ["bNII (min)", o.application.bnii_min_lots]] as [label, lots]}
              <tr><td class="left">{label}</td><td>{lots}</td><td>{sh(lots * o.application.lot_size)}</td><td>{price(lots * o.application.lot_cost)}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
      <h3>Category limits</h3>
      <div class="table-scroll">
        <table>
          <thead><tr><th class="left">Category</th><th>Bid size</th><th>Cut-off</th></tr></thead>
          <tbody>
            <tr><td class="left">Retail (RII)</td><td>Up to ₹2 lakh</td><td>Yes</td></tr>
            <tr><td class="left">Small HNI (sNII)</td><td>₹2 lakh – ₹10 lakh</td><td>No</td></tr>
            <tr><td class="left">Big HNI (bNII)</td><td>Above ₹10 lakh</td><td>No</td></tr>
          </tbody>
        </table>
      </div>
      <p class="note">Bidding at cut-off means accepting the final issue price without naming one. Only retail and employee applicants may do so. Amounts use the top of the price band.</p>
    {/if}
  </section>

  {#if o.anchor}
    <section id="anchor" class="card pad">
      <header class="sec"><h2>Anchor investors</h2><span class="muted">Institutional allocation placed a day before the issue opens, carved out of the QIB portion and locked in after listing</span></header>
      <dl class="grid4 tight">
        <div><dt>Shares allocated</dt><dd>{sh(o.anchor.shares)}</dd></div>
        <div><dt>Anchor portion</dt><dd>{cr(o.anchor.amount_cr)}</dd></div>
        <div><dt>Of total issue</dt><dd>{o.anchor.pct_of_total == null ? "—" : `${o.anchor.pct_of_total.toFixed(2)}%`}</dd></div>
        <div><dt>Lock-in ends (est.)</dt><dd>{date(o.anchor.lockin_50pct)} <small>50%</small><br />{date(o.anchor.lockin_rest)} <small>rest</small></dd></div>
      </dl>
      {#if o.anchor.report_url}<p class="note"><a href={o.anchor.report_url} target="_blank" rel="noopener noreferrer">Anchor allocation report (NSE) ↗</a></p>{/if}
    </section>
  {/if}

  {#if o.about || o.strengths.length || o.risks.length}
    <section id="about" class="card pad">
      {#if o.about}<header class="sec"><h2>About {o.name}</h2></header><p class="prose">{o.about}</p>{/if}
      <div class="two">
        {#if o.strengths.length}<div><h3>Strengths</h3><ul class="bul up">{#each o.strengths as t}<li>{t}</li>{/each}</ul></div>{/if}
        {#if o.risks.length}<div><h3>Risk factors</h3><ul class="bul down">{#each o.risks as t}<li>{t}</li>{/each}</ul></div>{/if}
      </div>
      <p class="note">Summarised from the offer document by a data provider. Read the prospectus before applying.</p>
    </section>
  {/if}

  <section id="faq" class="card pad">
    <header class="sec"><h2>{o.name} IPO FAQs</h2></header>
    {#each faq as [q, a]}<details><summary>{q}</summary><p>{a}</p></details>{/each}
  </section>

  <p class="sub source">
    Figures are compiled from NSE's published bidding data{#if o.gmp.latest != null}; grey-market premium from ipoalerts.in{/if}. Subscription changes until the issue closes, and the final basis of allotment is published by the registrar. Dates, chances and bracket sizes are estimates. Grey-market premium is unofficial, indicative data from unregulated dealers, not published by NSE, BSE, SEBI or the issuer, and not a forecast. Nothing here is investment advice; read the offer document and consult a SEBI-registered adviser before applying.
  </p>
</div>

<style>
  .crumbs { color: var(--ink-3); font-size: 13px; margin: 0 0 8px; }
  .crumbs a:hover { color: var(--ink); }
  .subnav { position: sticky; top: 57px; z-index: 10; display: flex; gap: 20px; overflow-x: auto; padding: 10px 0; margin-bottom: 14px; background: var(--bg); border-bottom: 1px solid var(--line); white-space: nowrap; scrollbar-width: none; }
  .subnav::-webkit-scrollbar { display: none; }
  section[id] { scroll-margin-top: 110px; }
  .card { margin-bottom: 16px; }
  .pad { padding: 18px; }
  .hero { padding: 20px; display: grid; grid-template-columns: 1fr auto; gap: 18px 24px; align-items: center; }
  .who { display: flex; gap: 14px; align-items: center; min-width: 0; }
  .who img, .mono { width: 56px; height: 56px; border-radius: 10px; object-fit: contain; background: #fff; border: 1px solid var(--line); flex: none; }
  .mono { display: grid; place-items: center; font-size: 24px; font-weight: 600; background: var(--panel-2); color: var(--ink-2); }
  h1 { font-size: 24px; margin: 0; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0; }
  .big { text-align: right; display: grid; }
  .big b { font-size: 30px; font-variant-numeric: tabular-nums; }
  .big b small, .total small { font-size: 14px; font-weight: 500; margin-left: 4px; }
  .big span, .total small { color: var(--ink-3); font-size: 12.5px; }
  .big.sm b { font-size: 24px; }
  .up { color: var(--up); } .down { color: var(--down); }
  .chip.up { color: var(--up); }
  .grid4 { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; margin: 0; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
  .grid4 > div { padding: 12px 14px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); margin: 0 -1px -1px 0; }
  .grid4.tight { grid-column: auto; margin-bottom: 14px; }
  dt { color: var(--ink-3); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.04em; }
  dd { margin: 4px 0 0; font-weight: 600; font-variant-numeric: tabular-nums; }
  dd small { color: var(--ink-3); font-weight: 400; }
  .sec { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 6px 16px; margin-bottom: 14px; }
  h2 { font-size: 17px; margin: 0; }
  h3 { font-size: 14px; margin: 20px 0 8px; color: var(--ink-2); }
  .muted, .note { color: var(--ink-3); font-size: 12.5px; }
  .note { margin: 12px 0 0; line-height: 1.55; }
  .note b { color: var(--ink); }
  .steps { list-style: none; display: grid; grid-template-columns: repeat(6, 1fr); margin: 0; padding: 0; }
  .steps li { display: grid; justify-items: center; gap: 4px; text-align: center; position: relative; font-size: 13px; }
  .steps li::before { content: ""; position: absolute; top: 7px; left: -50%; right: 50%; height: 2px; background: var(--line-2); }
  .steps li:first-child::before { display: none; }
  .steps i { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--line-2); background: var(--panel); position: relative; z-index: 1; }
  .steps .done i { border-color: var(--up); } .steps .done::before { background: var(--up); }
  .steps .today i, .steps .next i { border-color: var(--accent); box-shadow: 0 0 0 4px var(--panel-2); }
  .steps b { font-weight: 500; font-size: 12px; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.03em; margin-top: 4px; }
  .steps span { font-variant-numeric: tabular-nums; }
  .total { font-size: 22px; display: flex; align-items: baseline; gap: 6px; }
  .rows { list-style: none; margin: 0; padding: 0; }
  .rows li { display: flex; justify-content: space-between; gap: 12px; padding: 11px 0; border-top: 1px solid var(--line); }
  .rows li:first-child { border-top: 0; }
  .rows em { font-style: normal; color: var(--ink-3); font-size: 12px; margin-left: 6px; }
  .rows b { font-variant-numeric: tabular-nums; }
  .chart { width: 100%; height: auto; display: block; }
  .area { fill: var(--up-soft); } .line { stroke: var(--up); stroke-width: 2; } .dot { fill: var(--up); stroke: var(--panel); stroke-width: 2; }
  .axis { display: flex; justify-content: space-between; color: var(--ink-3); font-size: 12px; margin: 4px 0 12px; }
  details { border-top: 1px solid var(--line); }
  summary { cursor: pointer; padding: 12px 0; font-size: 13px; color: var(--ink-2); }
  details p { margin: 0 0 12px; color: var(--ink-2); font-size: 14px; line-height: 1.6; }
  tr.tot td { font-weight: 600; border-top: 1px solid var(--line-2); }
  td.within { padding-left: 28px; } td em { color: var(--ink-3); font-style: normal; font-size: 12px; margin-left: 4px; }
  td.up { color: var(--up); }
  .kv { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0 32px; margin: 0; }
  .kv > div { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-top: 1px solid var(--line); }
  .kv dt { text-transform: none; letter-spacing: 0; font-size: 13px; } .kv dd { margin: 0; text-align: right; }
  .docs { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 8px 18px; }
  .docs a { text-decoration: underline; font-size: 14px; }
  .prose { margin: 0 0 16px; line-height: 1.65; color: var(--ink-2); }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 0 28px; }
  .bul { margin: 0; padding-left: 18px; display: grid; gap: 8px; font-size: 14px; line-height: 1.5; color: var(--ink-2); }
  .bul.up li::marker { color: var(--up); } .bul.down li::marker { color: var(--down); }
  .source { font-size: 12.5px; line-height: 1.6; margin-top: 8px; }
  @media (max-width: 720px) {
    .hero { grid-template-columns: 1fr; } .big { text-align: left; }
    .grid4 { grid-template-columns: repeat(2, 1fr); }
    .steps { grid-template-columns: repeat(3, 1fr); row-gap: 14px; } .steps li:nth-child(4)::before { display: none; }
    .kv, .two { grid-template-columns: 1fr; }
    .subnav { top: 49px; }
  }
</style>
