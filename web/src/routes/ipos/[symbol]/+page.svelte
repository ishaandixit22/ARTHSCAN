<script lang="ts">
  import { BRAND } from "$lib/brand";
  import IpoLogo from "$lib/components/IpoLogo.svelte";
  import { date, fetchedAt, int, pct, tone } from "$lib/format";

  let { data } = $props();
  const o = $derived(data.ipo);
  const by = $derived(Object.fromEntries(o.subscription.map((r: any) => [r.key, r])));
  const splitNii = $derived((o.sub_days ?? []).some((d: any) => d.bnii != null || d.snii != null));
  const price = (v: number | null | undefined) => (v == null ? "—" : `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
  const cr = (v: number | null | undefined) => (v == null ? "—" : `₹${Math.round(v).toLocaleString("en-IN")} Cr`);
  const times = (v: number | null | undefined) => (v == null ? "—" : `${v.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}×`);
  const chance = (v: number) => (v >= 1 ? "100%" : v < 0.1 ? `${(v * 100).toFixed(1)}%` : `${Math.round(v * 100)}%`);
  const sh = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-IN"));
  const rupee = (v: number | null | undefined) => (v == null ? "—" : `${v < 0 ? "−" : ""}₹${Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
  const band = $derived(!o.price_high ? "—" : o.price_low && o.price_low !== o.price_high ? `${price(o.price_low)} – ${price(o.price_high)}` : price(o.price_high));
  const stateLabel = $derived(o.listing?.price != null ? "Listed" : o.status === "open" ? "Open for bidding" : o.status === "upcoming" ? "Opens soon" : "Bidding closed");
  const isListed = $derived(o.listing?.price != null);

  // Company numbers arrive as published text ("1,508.24"). A financials block can be prose instead of rows.
  const n = (v: unknown) => { const x = Number(String(v ?? "").replace(/,/g, "")); return String(v ?? "").trim() !== "" && Number.isFinite(x) ? x : null; };
  const fin = $derived(o.company?.financials ?? null);
  const finRows = $derived<any[]>(fin?.rows ?? []);
  const headers = $derived<string[]>(fin?.headers ?? []);
  // "31 Mar 2026" is a full financial year, FY26. Any other date is a part-year, named as it stands so it can't pass for one.
  const period = (h: string) => { const m = /^(\d+) (\w+) (\d{4})$/.exec(h); return !m ? h : m[2] === "Mar" ? `FY${m[3].slice(2)}` : `${m[2]} ${m[3].slice(2)}`; };
  const partYear = (h: string) => /^\d+ \w+ \d{4}$/.test(h) && !/ Mar /.test(h);
  const hasPartYear = $derived(headers.some(partYear));
  const inCrore = $derived(!fin?.unit || /crore/i.test(fin.unit));
  // The headline figures read across full years only: a part-year beside them looks like a collapse.
  const bars = $derived.by(() => {
    const wanted = [[/total income/i, /revenue/i], [/profit after|^pat\b/i], [/^assets|total assets/i], [/net ?worth/i]];
    const years = headers.map((h, i) => ({ h, i })).filter((x) => !partYear(x.h));
    const cols = years.length >= 2 ? years : headers.map((h, i) => ({ h, i }));
    return wanted.flatMap((res) => {
      const row = res.map((re) => finRows.find((r) => re.test(r.metric ?? ""))).find(Boolean);
      if (!row) return [];
      const vals = cols.map(({ h, i }) => ({ h: period(h), v: n(row.data?.[i]) })).reverse(); // headers come newest first; bars read oldest to newest
      const last = [...vals].reverse().find((x) => x.v != null);
      if (!last) return [];
      return [{ metric: row.metric, vals, top: Math.max(...vals.map((x) => Math.abs(x.v ?? 0)), 1), last }];
    });
  });
  const growth = $derived.by(() => {
    const change = (b: any) => { const known = b?.vals.filter((x: any) => x.v != null) ?? []; if (known.length < 2) return null; const [a, z] = known.slice(-2); return a.v > 0 ? ((z.v - a.v) / a.v) * 100 : null; };
    const inc = change(bars[0]), pat = change(bars.find((b) => /profit|pat/i.test(b.metric)));
    if (inc == null && pat == null) return null;
    const label = bars[0].last.h;
    return `${label}: ${inc != null ? `income ${inc >= 0 ? "+" : "−"}${Math.abs(inc).toFixed(1)}%` : ""}${inc != null && pat != null ? ", " : ""}${pat != null ? `profit ${pat >= 0 ? "+" : "−"}${Math.abs(pat).toFixed(1)}%` : ""} on the year before`;
  });

  const objects = $derived.by(() => { const v = o.company?.objects; return { items: ((Array.isArray(v) ? v : v?.items) ?? []) as any[], text: typeof v === "string" ? v : v?.text ?? null }; });
  const objectName = (it: any) => it.name ?? it.title ?? it.object ?? String(it);
  const objectCr = (it: any) => it.amount_cr ?? n(it.amount);
  const quantified = $derived(objects.items.reduce((sum, it) => sum + (objectCr(it) ?? 0), 0));
  const unstated = $derived(objects.items.filter((it) => objectCr(it) == null).length);
  const paragraphs = $derived(String(o.about ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean));
  const website = $derived.by(() => { const w = o.contacts?.company?.website; return w ? { href: /^https?:/.test(w) ? w : `https://${w}`, label: w.replace(/^https?:\/\//, "").replace(/\/$/, "") } : null; });
  const promoters = $derived(o.company?.promoters ?? null);
  const hold = $derived(o.company?.holding ?? null);

  // Plain answers to what someone asks before applying, each from a number on this page.
  const verdictLines = $derived.by(() => {
    const out: { q: string; a: string; tone?: string }[] = [];
    if (o.costs) out.push({ q: "What do I pay?", a: `${price(o.costs.lot_cost)} for one lot of ${int(o.costs.lot_size)} shares at the top of the band. Retail can bid up to ${o.costs.retail_max_lots} lot${o.costs.retail_max_lots > 1 ? "s" : ""}.` });
    if (o.times_total != null) out.push({ q: "How strong is demand?", a: `${times(o.times_total)} overall${by.retail?.times != null ? `, ${times(by.retail.times)} from retail` : ""}${by.qib?.times != null ? ` and ${times(by.qib.times)} from institutions` : ""}. ${o.times_total >= 1 ? "Oversubscribed, so allotment is a lottery." : "Not fully subscribed yet."}` });
    if (o.gmp.latest != null) out.push({ q: "What is the grey market saying?", a: `${rupee(o.gmp.latest)} per share (${pct(o.gmp.pct)}), which implies about ${price(o.gmp.est_listing)}. Unofficial, and it often moves right up to listing.`, tone: tone(o.gmp.latest) });
    if (o.retail_odds) out.push({ q: "What are my allotment odds?", a: `About ${chance(o.retail_odds.chance)} for a retail lot, assuming each applicant bids one lot.` });
    const when = o.status === "open" ? `Bidding closes ${date(o.dates.close)}` : o.status === "upcoming" ? `Bidding opens ${date(o.dates.open)}` : "Bidding has closed";
    out.push({ q: "When?", a: `${when}. Allotment ${date(o.dates.allotment)}, listing ${date(o.dates.listing)}. Dates can shift.` });
    return out;
  });
  const listingLine = $derived.by(() => {
    const l = o.listing;
    if (!l || l.gain == null) return null;
    const side = (v: number) => (v === 0 ? "at" : `${Math.abs(v).toFixed(2)}% ${v > 0 ? "above" : "below"}`);
    return `It listed ${side(l.gain)} its issue price${l.current_gain != null ? ` and now trades ${side(l.current_gain)} it` : ""}.`;
  });
  const cmpDate = $derived(o.listing?.cmp_at ? date(String(o.listing.cmp_at).slice(0, 10)) : null);

  const SUB_ROWS = [["qib", "Qualified institutional", "QIB"], ["nii", "Non-institutional", "NII · above ₹2 lakh"], ["bnii", "Big non-institutional", "bNII · above ₹10 lakh"], ["snii", "Small non-institutional", "sNII · ₹2–10 lakh"], ["retail", "Retail individual", "RII · up to ₹2 lakh"], ["employee", "Employees", "reserved quota"], ["shareholder", "Shareholders", "reserved quota"]];
  const subRows = $derived(SUB_ROWS.filter(([k]) => by[k] && !(k === "nii" && by.bnii)));
  const subTop = $derived(Math.max(...subRows.map(([k]) => by[k].times ?? 0), 1));
  const hasEmployee = $derived(!!by.employee);

  const readingsChart = $derived.by(() => {
    const pts = (o.gmp_readings ?? []).filter((r: any) => r.gmp != null);
    return pts.length >= 2 ? pts : null;
  });

  // GMP chart: day-wise premium, oldest to newest.
  const days = $derived([...o.gmp.days].reverse());
  const W = 640, H = 170, PAD = 10;
  const chart = $derived.by(() => {
    if (days.length < 2) return null;
    const vals = days.map((d: any) => d.gmp), lo = Math.min(0, ...vals), hi = Math.max(...vals), span = hi - lo || 1;
    const px = (i: number) => PAD + (i / (days.length - 1)) * (W - 2 * PAD);
    const py = (v: number) => H - PAD - ((v - lo) / span) * (H - 2 * PAD);
    const line = days.map((d: any, i: number) => `${i ? "L" : "M"}${px(i).toFixed(1)},${py(d.gmp).toFixed(1)}`).join("");
    const pts = days.map((d: any, i: number) => ({ x: px(i), y: py(d.gmp), d }));
    return { line, pts, area: `${line}L${px(days.length - 1)},${H - PAD}L${px(0)},${H - PAD}Z`, last: pts[pts.length - 1] };
  });

  const TABS = [
    ["overview", "Overview"], ["subscription", "Subscription"], ["bids", "Bids received"], ["details", "IPO details"], ["reservation", "Reservation & lots"], ["anchor", "Anchor"],
    ["valuation", "Key ratios"], ["financials", "Financials"], ["objects", "Objects"], ["about", "Company"], ["documents", "Documents"], ["faq", "FAQ"],
  ];
  const tabs = $derived(TABS.filter(([k]) => (
    k === "anchor" ? !!(o.anchor || o.anchors?.anchors?.length)
    : k === "about" ? !!(o.about || o.strengths.length || o.risks.length)
    : k === "financials" ? !!fin
    : k === "valuation" ? !!o.company?.kpis?.length
    : k === "objects" ? !!(objects.items.length || objects.text)
    : k === "documents" ? !!o.documents.length
    : true)));

  const faq = $derived([
    [`What is the GMP of ${o.name} IPO?`, o.gmp.latest != null ? `The latest grey market premium (GMP) is ${rupee(o.gmp.latest)} per share (${pct(o.gmp.pct)}). GMP is unofficial, indicative grey-market data and not a forecast of the listing price.` : "No grey-market premium is reported for this issue right now. GMP is unofficial and not a forecast."],
    [`What is the price band of ${o.name} IPO?`, `The price band is ${band} per share.`],
    [`What is the lot size of ${o.name} IPO?`, o.costs ? `One lot is ${int(o.costs.lot_size)} shares, which costs ${price(o.costs.lot_cost)} at the top of the band.` : "The lot size has not been published yet."],
    [`When does ${o.name} IPO open and close?`, `It opens on ${date(o.dates.open)} and closes on ${date(o.dates.close)}.`],
    [`What is the listing date of ${o.name} IPO?`, isListed ? `It listed on ${date(o.dates.listing)}.` : `The expected listing date is ${date(o.dates.listing)}. It is tentative until the exchange confirms it.`],
    [`What is the subscription status of ${o.name} IPO?`, o.times_total != null ? `${times(o.times_total)} subscribed overall${o.data_as_of ? ` (${o.data_as_of.replace("Updated as on ", "NSE, ")})` : ""}: QIB ${times(by.qib?.times)}, NII ${times(by.nii?.times)}, retail ${times(by.retail?.times)}.` : "Bidding has not started, or NSE has not published bids yet."],
  ]);
</script>

<svelte:head><title>{o.name} IPO GMP, Subscription & Price Band — {BRAND}</title></svelte:head>

<div class="page">
  <p class="crumbs"><a href="/">Home</a> › <a href="/ipos">IPO</a> › {o.name} IPO</p>
  <nav class="subnav" aria-label="Sections">
    {#each tabs as [k, label]}<a href="#{k}">{label}</a>{/each}
  </nav>

  <section id="overview" class="box hero">
    <div class="top">
      <div class="who">
        <IpoLogo src={o.logo} name={o.name} size={68} />
        <div>
          <h1>{o.name}</h1>
          <p class="chips">
            {#if o.issue_type}<span class="chip">{o.issue_type}</span>{/if}<span class="chip">{o.board}</span>{#if o.exchange}<span class="chip">{o.exchange}</span>{/if}<span class="chip">{stateLabel}</span>
          </p>
        </div>
      </div>
      {#if isListed && o.listing.gain != null}
        <div class="big"><b class={tone(o.listing.gain)}>{pct(o.listing.gain)}</b><span>Listing gain over issue price</span></div>
      {:else if o.times_total != null}
        <div class="big"><b class:up={o.times_total >= 1}>{times(o.times_total)}</b><span>Overall subscription</span></div>
      {:else if o.gmp.latest != null}
        <div class="big"><b class={tone(o.gmp.latest)}>{rupee(o.gmp.latest)}</b><span>Grey market premium, unofficial</span></div>
      {/if}
    </div>
    <dl class="cells four">
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

  {#if isListed}
    <section class="box" aria-labelledby="perf">
      <header class="sec"><h2 id="perf">Listing performance</h2></header>
      <dl class="perf">
        <div><dt>Issue price</dt><dd>{price(o.price_high)}</dd></div>
        <div><dt>Listed at</dt><dd>{price(o.listing.price)}</dd></div>
        <div><dt>Latest price</dt><dd>{price(o.listing.cmp)}</dd>{#if cmpDate}<small>On {cmpDate}</small>{/if}</div>
        <div class="loud"><dt>Listing gain</dt><dd class={tone(o.listing.gain)}>{pct(o.listing.gain)}</dd></div>
        <div class="loud"><dt>Return since issue</dt><dd class={tone(o.listing.current_gain)}>{pct(o.listing.current_gain)}</dd></div>
      </dl>
      {#if listingLine}<p class="plain">{listingLine}</p>{/if}
    </section>
  {:else if verdictLines.length}
    <section class="box" aria-labelledby="before">
      <header class="sec"><h2 id="before">Before you apply</h2><span class="muted">The essentials in plain words. This is not a recommendation to apply or to stay out.</span></header>
      <dl class="answers">
        {#each verdictLines as l}<div><dt>{l.q}</dt><dd class={l.tone ?? ""}>{l.a}</dd></div>{/each}
      </dl>
    </section>
  {/if}

  <section class="box" aria-labelledby="dates">
    <header class="sec"><h2 id="dates">Scheduled dates</h2><span class="muted">Tentative timetable. A past date is not confirmation the step completed.</span></header>
    <ol class="steps">
      {#each o.timeline as s}
        <li class={s.state}><i></i><b>{s.label}</b><span>{date(s.date)}</span></li>
      {/each}
    </ol>
  </section>

  <div class="duo">
    <section id="subscription" class="box">
      <header class="sec"><h2>Subscription</h2><b class="total" class:up={(o.times_total ?? 0) >= 1}>{times(o.times_total)}<small>overall</small></b></header>
      {#if subRows.length}
        <ul class="meters">
          {#each subRows as [k, name, tag]}
            <li>
              <span>{name} <em>{tag}</em></span><b class:up={(by[k].times ?? 0) >= 1}>{times(by[k].times)}</b>
              <i class:over={(by[k].times ?? 0) >= 1} style="width: {Math.max(1, ((by[k].times ?? 0) / subTop) * 100)}%"></i>
            </li>
          {/each}
        </ul>
        {#if o.applications != null}<p class="note"><b>{sh(o.applications)}</b> applications{o.status === "open" ? " so far" : ""}.</p>{/if}
        {#if o.sub_updated}<p class="note">{o.sub_from === "nse" ? "NSE's figure" : "Provider's figure"} as of {fetchedAt(o.sub_updated)}. {o.sub_from === "ipoguru" && !by.total ? "This issue is not on NSE's board, so it can lag the exchange." : ""}</p>{/if}
        {#if o.qib_interest_cost?.rates?.length}<p class="note">A fully leveraged QIB needs about <b>{o.qib_interest_cost.rates[0].cost_percent}%</b> over the price just to cover funding at {o.qib_interest_cost.rates[0].rate_percent}% a year. Arithmetic from IPO Guru, not advice.</p>{/if}
        {#if o.retail_odds}<p class="note">Retail chance of a lot is about <b>{chance(o.retail_odds.chance)}</b>: {sh(o.retail_odds.lots_offered)} lots on offer against {sh(o.retail_odds.lots_bid)} lots bid for. An estimate that assumes each applicant bids one lot.</p>{/if}
      {:else}
        <p class="note">{o.times_total != null ? "The split by investor category isn't available right now." : "No bids have been published for this issue yet. They appear once bidding starts."}</p>
      {/if}
      {#if o.sub_days?.length}
        <h3>How the book built up</h3>
        <div class="table-scroll">
          <table>
            <thead><tr><th class="left">Date</th><th>QIB</th><th>NII</th>{#if splitNii}<th>bNII</th><th>sNII</th>{/if}<th>Retail</th><th>Total</th></tr></thead>
            <tbody>{#each o.sub_days as day}<tr><td class="left">{date(day.date)}</td><td>{times(n(day.qib))}</td><td>{times(n(day.nii))}</td>{#if splitNii}<td>{times(n(day.bnii))}</td><td>{times(n(day.snii))}</td>{/if}<td>{times(n(day.retail))}</td><td><b>{times(n(day.total))}</b></td></tr>{/each}</tbody>
          </table>
        </div>
        {#if o.sub_days_from === "own"}<p class="note">Our own record: the last figure we read each day, so today's row is still moving. A day is missing if we weren't recording yet.</p>{/if}
      {/if}
    </section>

    <section id="gmp" class="box">
      <header class="sec">
        <div><h2>Grey market premium</h2><span class="muted">Unofficial and indicative, not a forecast</span></div>
        {#if o.gmp.latest != null}<b class="total {tone(o.gmp.latest)}">{rupee(o.gmp.latest)}<small>{pct(o.gmp.pct)}</small></b>{/if}
      </header>
      {#if o.gmp.latest != null}
        <dl class="cells two-up">
          <div><dt>Estimated listing</dt><dd>{price(o.gmp.est_listing)}</dd></div>
          <div><dt>Gain per lot</dt><dd class={tone(o.gmp.profit_per_lot)}>{rupee(o.gmp.profit_per_lot)}</dd></div>
          <div><dt>Range · {days.length} days</dt><dd>{o.gmp.range ? `${rupee(o.gmp.range[0])} – ${rupee(o.gmp.range[1])}` : "—"}</dd></div>
          {#if o.gmp.change_24h != null}<div><dt>24-hour change</dt><dd class={tone(o.gmp.change_24h)}>{o.gmp.change_24h === 0 ? "unchanged" : rupee(o.gmp.change_24h)}</dd></div>{/if}
          {#if o.gmp.sauda != null}<div><dt>Subject to sauda</dt><dd>{rupee(o.gmp.sauda)}</dd></div>{/if}
          {#if o.gmp.kostak != null}<div><dt>Kostak</dt><dd>{rupee(o.gmp.kostak)}</dd></div>{/if}
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
        {#if o.gmp_intraday?.length || readingsChart}
          <details>
            <summary>Every reading · {o.gmp_intraday?.length || readingsChart?.length}</summary>
            <div class="table-scroll">
              <table>
                <thead><tr><th class="left">When</th><th>GMP</th></tr></thead>
                <tbody>
                  {#if o.gmp_intraday?.length}{#each [...o.gmp_intraday].reverse() as p}<tr><td class="left">{p.label ?? p.recorded_at}</td><td class={tone(p.price_value)}>{rupee(p.price_value)}</td></tr>{/each}
                  {:else}{#each [...readingsChart].reverse() as p}<tr><td class="left">{fetchedAt(p.at)}</td><td class={tone(p.gmp)}>{rupee(p.gmp)}</td></tr>{/each}{/if}
                </tbody>
              </table>
            </div>
          </details>
        {/if}
        <p class="note">{#if o.gmp.updated}Read {fetchedAt(o.gmp.updated)}. {/if}Gain per lot assumes the premium holds to listing and that the application is allotted, and allotment in an oversubscribed issue is a lottery. Sauda is the rate paid for a submitted application itself.</p>
      {:else}
        <p class="note">{!o.gmp_connected ? "Grey-market premium is not connected yet." : o.gmp_error ? `Grey-market premium is unavailable: ${o.gmp_error}.` : "No grey-market premium is reported for this issue yet."}</p>
      {/if}
    </section>
  </div>

  <section id="bids" class="box">
    <header class="sec"><div><h2>Bids received</h2><span class="muted">The demand behind each multiple: what was offered, what was bid for, and what those bids are worth</span></div></header>
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
    <p class="note">Times subscribed is the published figure for each category, not shares bid for divided by shares offered. Bids in ₹ are shares bid for at the top of the price band.{#if o.data_as_of}{" "}{o.data_as_of.replace("Updated as on ", "Observed ")} IST.{/if} The registrar publishes the final basis of allotment.</p>
  </section>

  <section id="details" class="box">
    <header class="sec"><h2>Issue details</h2></header>
    <dl class="kv">
      <div><dt>IPO date</dt><dd>{date(o.dates.open)} – {date(o.dates.close)}</dd></div>
      <div><dt>Listing date</dt><dd>{date(o.dates.listing)}</dd></div>
      <div><dt>Face value</dt><dd>{o.facts.face_value ?? "—"}</dd></div>
      <div><dt>Price band</dt><dd>{band}</dd></div>
      <div><dt>Issue price (top of band)</dt><dd>{price(o.price_high)} per share</dd></div>
      <div><dt>Lot size</dt><dd>{o.costs ? int(o.costs.lot_size) : "—"} shares</dd></div>
      <div><dt>Sale type</dt><dd>{o.facts.type_of_issue ?? o.issue_type ?? "—"}</dd></div>
      <div><dt>Listing at</dt><dd>{o.facts.listing_at ?? o.exchange ?? "—"}</dd></div>
      <div><dt>Total issue size</dt><dd>{cr(o.issue_size_cr)}{#if o.issue_size_from === "estimate"} <small>(shares × price, approximate)</small>{/if}</dd></div>
      {#if o.facts.fresh_issue_cr != null}<div><dt>Fresh issue</dt><dd>{cr(o.facts.fresh_issue_cr)}</dd></div>{/if}
      {#if o.facts.offer_for_sale_cr != null}<div><dt>Offer for sale</dt><dd>{cr(o.facts.offer_for_sale_cr)}</dd></div>{/if}
      {#if hold}<div><dt>Promoter holding</dt><dd>{hold.pre ?? "—"} → {hold.post ?? "—"} <small>pre → post issue</small></dd></div>{/if}
      {#if o.facts.employee_discount}<div><dt>Employee discount</dt><dd>{o.facts.employee_discount}</dd></div>{/if}
      <div><dt>Registrar</dt><dd>{#if o.registrar_status_url}<a href={o.registrar_status_url} target="_blank" rel="noopener noreferrer">{o.facts.registrar ?? "Check allotment"} ↗</a>{:else}{o.facts.registrar ?? "—"}{/if}</dd></div>
      <div><dt>Lead managers</dt><dd>{o.facts.lead_managers ?? "—"}</dd></div>
      {#if o.facts.sponsor_bank}<div><dt>Sponsor bank</dt><dd>{o.facts.sponsor_bank}</dd></div>{/if}
      {#if o.contacts?.company?.address}<div class="wide"><dt>Registered office</dt><dd>{o.contacts.company.address}</dd></div>{/if}
    </dl>
  </section>

  <div class="duo" id="reservation">
    <section class="box">
      <header class="sec"><div><h2>Reservation</h2><span class="muted">How the issue is split between investor categories</span></div></header>
      {#if o.reservation.rows.length}
        <div class="table-scroll">
          <table>
            <thead><tr><th class="left">Investor category</th><th>Shares</th><th>% of net</th><th>% of total</th></tr></thead>
            <tbody>
              {#each o.reservation.rows as r}
                <tr><td class="left" class:within={r.within}>{r.label}</td><td>{sh(r.shares)}</td><td>{r.pct_net == null ? "—" : `${r.pct_net.toFixed(2)}%`}</td><td>{r.pct_total == null ? "—" : `${r.pct_total.toFixed(2)}%`}</td></tr>
              {/each}
              <tr class="tot"><td class="left">Total issue</td><td>{sh(o.reservation.total)}</td><td>—</td><td>100.00%</td></tr>
            </tbody>
          </table>
        </div>
        <p class="note">Net offer to the public: {sh(o.reservation.net)} shares{#if o.anchor}; the anchor portion is placed a day before the issue opens and sits on top of it{/if}. Indented rows sit inside the category above and are not added to it.</p>
      {:else if o.reservation_guru?.length}
        <ul class="rows">{#each o.reservation_guru as r}<li><span>{r.category}</span><b>{r.reservation}</b></li>{/each}</ul>
      {:else}
        <p class="note">The split has not been published yet.</p>
      {/if}
    </section>
    <div class="stack">
      {#if o.application && o.costs}
        <section class="box">
          <header class="sec"><div><h2>Application size</h2><span class="muted">{int(o.application.lot_size)} shares per lot, in multiples, at {price(o.price_high)}</span></div></header>
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
        </section>
      {/if}
      <section class="box">
        <header class="sec"><h2>Category limits</h2></header>
        <div class="table-scroll">
          <table>
            <thead><tr><th class="left">Category</th><th class="left">Bid size</th><th>Cut-off</th></tr></thead>
            <tbody>
              <tr><td class="left">Retail (RII)</td><td class="left">Up to ₹2 lakh</td><td class="up">Yes</td></tr>
              <tr><td class="left">Small HNI (sNII)</td><td class="left">₹2 lakh – ₹10 lakh</td><td>No</td></tr>
              <tr><td class="left">Big HNI (bNII)</td><td class="left">Above ₹10 lakh</td><td>No</td></tr>
              {#if hasEmployee}<tr><td class="left">Employee</td><td class="left">Up to ₹5 lakh</td><td class="up">Yes</td></tr>{/if}
            </tbody>
          </table>
        </div>
        <p class="note">Bidding at cut-off means accepting the final issue price without naming one.</p>
      </section>
    </div>
  </div>

  {#if o.anchor || o.anchors?.anchors?.length}
    <section id="anchor" class="box">
      <header class="sec"><div><h2>Anchor investors</h2><span class="muted">Institutional allocation placed a day before the issue opens, carved out of the QIB portion and locked in after listing</span></div></header>
      {#if o.anchors?.anchors?.length}
        <dl class="cells kpis">
          <div><dt>Anchor book</dt><dd>{cr(o.anchors.summary?.total_amount_cr)}</dd></div>
          <div><dt>Investors</dt><dd>{o.anchors.summary?.total_anchors ?? "—"}</dd></div>
          <div><dt>Mutual funds</dt><dd>{o.anchors.summary?.mutual_fund_count ?? "—"}</dd></div>
        </dl>
        <details>
          <summary>Who took part · {o.anchors.anchors.length}</summary>
          <div class="table-scroll">
            <table>
              <thead><tr><th class="left">Investor</th><th>Shares</th><th>₹ Cr</th><th>% of anchor</th></tr></thead>
              <tbody>{#each o.anchors.anchors as x}<tr><td class="left">{x.name}</td><td>{sh(x.shares_allotted)}</td><td>{x.amount_cr ?? "—"}</td><td>{x.pct_allocated == null ? "—" : `${x.pct_allocated}%`}</td></tr>{/each}</tbody>
            </table>
          </div>
        </details>
      {/if}
      {#if o.anchor}
        <dl class="cells kpis">
          <div><dt>Shares allocated</dt><dd>{sh(o.anchor.shares)}</dd></div>
          <div><dt>Anchor portion</dt><dd>{cr(o.anchor.amount_cr)}</dd></div>
          <div><dt>Of total issue</dt><dd>{o.anchor.pct_of_total == null ? "—" : `${o.anchor.pct_of_total.toFixed(2)}%`}</dd></div>
          <div><dt>Lock-in ends (est.)</dt><dd>{date(o.anchor.lockin_50pct)} <small>50%</small><br />{date(o.anchor.lockin_rest)} <small>rest</small></dd></div>
        </dl>
        {#if o.anchor.report_url}<p class="note"><a href={o.anchor.report_url} target="_blank" rel="noopener noreferrer">Anchor allocation report (NSE) ↗</a></p>{/if}
      {/if}
    </section>
  {/if}

  {#if o.company?.kpis?.length}
    <section id="valuation" class="box">
      <header class="sec"><div><h2>Key ratios</h2><span class="muted">At the offer price and for the latest reported period, as published</span></div></header>
      <dl class="cells kpis">{#each o.company.kpis as k}<div><dt>{k.label ?? k.name ?? k.metric ?? k.kpi}</dt><dd>{k.value ?? k.data ?? "—"}</dd></div>{/each}</dl>
    </section>
  {/if}

  {#if fin}
    <section id="financials" class="box">
      <header class="sec"><div><h2>Company financials</h2><span class="muted">{fin.unit ?? "₹ crore"}, restated as published in the offer document</span></div>{#if growth}<b class="growth">{growth}</b>{/if}</header>
      {#if bars.length}
        <div class="bars">
          {#each bars as b}
            <figure>
              <figcaption>{b.metric}</figcaption>
              <b class="headline" class:down={(b.last.v ?? 0) < 0}>{inCrore ? "₹" : ""}{(b.last.v ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}{inCrore ? " Cr" : ""}<small>{b.last.h}</small></b>
              <div class="bar-row" role="img" aria-label="{b.metric}: {b.vals.map((x) => `${x.h} ${x.v ?? 'not published'}`).join(', ')}">
                {#each b.vals as x}
                  <div class="bar"><i class:neg={(x.v ?? 0) < 0} style="height: {Math.max(2, (Math.abs(x.v ?? 0) / b.top) * 64)}px" title={x.v == null ? "Not published" : x.v.toLocaleString("en-IN")}></i><span class="yr">{x.h}</span></div>
                {/each}
              </div>
            </figure>
          {/each}
        </div>
      {/if}
      {#if finRows.length}
        <div class="table-scroll">
          <table>
            <thead><tr><th class="left">Period ended</th>{#each headers as h}<th>{period(h)}</th>{/each}</tr></thead>
            <tbody>{#each finRows as r}<tr><td class="left">{r.metric}</td>{#each r.data as v}<td>{v === "" || v == null ? "—" : n(v)?.toLocaleString("en-IN", { maximumFractionDigits: 2 }) ?? v}</td>{/each}</tr>{/each}</tbody>
          </table>
        </div>
        {#if hasPartYear}<p class="note">A period not named FY is part of a year, so it isn't comparable with the full years beside it.</p>{/if}
      {:else if fin.text}<p class="prose">{fin.text}</p>{/if}
    </section>
  {/if}

  {#if objects.items.length || objects.text}
    <section id="objects" class="box">
      <header class="sec"><div><h2>Objects of the issue</h2><span class="muted">What the company says it will do with the money</span></div>{#if quantified}<b class="total sm">{cr(quantified)}<small>quantified</small></b>{/if}</header>
      {#if objects.items.length}
        <ol class="objects">{#each objects.items as it}<li><span>{objectName(it)}</span><b>{objectCr(it) != null ? `₹${objectCr(it).toLocaleString("en-IN")} Cr` : "—"}</b></li>{/each}</ol>
        {#if unstated && quantified}<p class="note">{unstated} of {objects.items.length} carry no stated amount, so the total above is the quantified part only, not the whole issue.</p>{/if}
      {:else}<p class="prose">{objects.text}</p>{/if}
    </section>
  {/if}

  {#if o.about || promoters}
    <section id="about" class="box">
      <header class="sec"><h2>About {o.name}</h2></header>
      <div class="columns">{#each paragraphs as p}<p class="prose">{p}</p>{/each}</div>
      {#if website}<p class="note"><a href={website.href} target="_blank" rel="noopener noreferrer nofollow">{website.label} ↗</a></p>{/if}
      {#if promoters}
        <h3>Promoters</h3>
        {#if Array.isArray(promoters)}<ul class="plainlist">{#each promoters as pr}<li>{pr.name ?? pr}</li>{/each}</ul>{:else}<p class="prose">{promoters}</p>{/if}
      {/if}
    </section>
  {/if}

  {#if o.strengths.length || o.risks.length}
    <div class="duo">
      {#if o.strengths.length}<section class="box"><header class="sec"><h2>Strengths</h2></header><ul class="bul up">{#each o.strengths as t}<li>{t}</li>{/each}</ul></section>{/if}
      {#if o.risks.length}<section class="box"><header class="sec"><h2>Risk factors</h2></header><ul class="bul down">{#each o.risks as t}<li>{t}</li>{/each}</ul></section>{/if}
    </div>
    <p class="note out">Summarised from the offer document by a data provider. Read the prospectus before applying.</p>
  {/if}

  {#if o.documents.length}
    <section id="documents" class="box">
      <header class="sec"><h2>Offer documents</h2></header>
      <ul class="docs">{#each o.documents as d}<li><a href={d.url} target="_blank" rel="noopener noreferrer">{d.label}<span>↗</span></a></li>{/each}</ul>
    </section>
  {/if}

  <section id="faq" class="box">
    <header class="sec"><h2>{o.name} IPO FAQs</h2></header>
    {#each faq as [q, a]}<details><summary>{q}</summary><p>{a}</p></details>{/each}
  </section>

  {#if o.recent?.length}
    <section class="box" aria-labelledby="recent">
      <header class="sec"><h2 id="recent">Recently listed IPOs</h2><a class="all" href="/ipos?tab=listed">All IPOs →</a></header>
      <ul class="recent">
        {#each o.recent as r (r.slug)}
          <li><a href="/ipos/{r.slug}"><IpoLogo src={r.logo} name={r.name} size={30} /><span>{r.name}</span>{#if r.listing_gain != null}<b class={tone(r.listing_gain)}>{pct(r.listing_gain)}</b>{/if}</a></li>
        {/each}
      </ul>
    </section>
  {/if}

  <p class="sub source">
    IPO data by <a href="https://www.ipoguru.in/">IPO Guru</a>; bids from NSE's published data where it carries the issue. Subscription changes until the issue closes, and the final basis of allotment is published by the registrar. Dates, chances and bracket sizes are estimates. Grey-market premium is unofficial, indicative data from unregulated dealers, not published by NSE, BSE, SEBI or the issuer, and not a forecast. Nothing here is investment advice; read the offer document and consult a SEBI-registered adviser before applying.
  </p>
</div>

<style>
  .page { gap: 16px; }
  .crumbs { color: var(--ink-3); font-size: 13px; margin: 0; }
  .crumbs a:hover { color: var(--ink); }
  .subnav { position: sticky; top: 57px; z-index: 10; display: flex; gap: 20px; overflow-x: auto; padding: 10px 0; background: var(--bg); border-bottom: 1px solid var(--line-2); white-space: nowrap; scrollbar-width: none; font-size: 13.5px; font-weight: 600; font-stretch: 88%; color: var(--ink-2); }
  .subnav::-webkit-scrollbar { display: none; }
  .subnav a:hover { color: var(--ink); text-decoration: underline; }
  section[id], div[id] { scroll-margin-top: 110px; }

  .box { min-width: 0; padding: 18px 20px; border: 1px solid var(--line-2); border-top: 3px solid var(--ink); }
  .duo { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
  .stack { display: grid; gap: 16px; min-width: 0; }

  .hero { padding: 0; }
  .top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 16px 24px; padding: 20px; }
  .who { display: flex; gap: 16px; align-items: center; min-width: 0; }
  h1 { font-size: clamp(30px, 3.4vw, 44px); line-height: 1; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 0; }
  .big { display: grid; text-align: right; gap: 3px; }
  .big b { font: 850 clamp(34px, 4vw, 50px)/1 var(--display); font-stretch: 72%; font-variant-numeric: tabular-nums; }
  .big span { color: var(--ink-3); font-size: 13px; }
  .up { color: var(--up); } .down { color: var(--down); }

  dl { margin: 0; }
  dt { color: var(--ink-3); font-size: 11px; font-weight: 700; font-stretch: 82%; text-transform: uppercase; letter-spacing: 0.05em; }
  dd { margin: 4px 0 0; font-weight: 650; font-size: 16px; font-stretch: 90%; font-variant-numeric: tabular-nums; }
  dd small { color: var(--ink-3); font-weight: 450; font-size: 12.5px; }
  .cells { display: grid; border-top: 1px solid var(--line); }
  .cells > div { padding: 13px 20px; border-bottom: 1px solid var(--line); border-right: 1px solid var(--line); }
  .four { grid-template-columns: repeat(4, 1fr); }
  .four > div:nth-child(4n) { border-right: 0; }
  .hero .cells > div:nth-last-child(-n + 4) { border-bottom: 0; }
  .box:not(.hero) > .cells { border: 1px solid var(--line); border-right: 0; border-bottom: 0; margin-bottom: 14px; }
  .box:not(.hero) > .cells > div { padding: 11px 13px; border-right: 1px solid var(--line); }
  .two-up { grid-template-columns: repeat(2, 1fr); }
  .kpis { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
  .box:not(.hero) > .kpis:last-child { margin-bottom: 0; }

  .perf { display: grid; grid-template-columns: 1fr 1fr 1.2fr 1.1fr 1.1fr; border: 1px solid var(--line); }
  .perf > div { display: grid; align-content: start; gap: 3px; padding: 13px 15px; border-right: 1px solid var(--line); }
  .perf > div:last-child { border-right: 0; }
  .perf small { color: var(--ink-3); font-size: 12.5px; }
  .loud { background: var(--panel-2); }
  .loud dd { font: 850 30px/1.05 var(--display); font-stretch: 72%; }
  .plain { margin: 12px 0 0; font-family: var(--serif); font-size: 15px; line-height: 1.5; color: var(--ink-2); }

  .sec { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 6px 16px; margin-bottom: 14px; }
  h2 { font-size: 22px; font-weight: 850; font-stretch: 72%; line-height: 1.1; }
  h3 { font-size: 15px; font-weight: 800; font-stretch: 78%; margin: 20px 0 8px; color: var(--ink); }
  .muted, .note { color: var(--ink-3); font-size: 13px; }
  .sec .muted { display: block; margin-top: 4px; }
  .note { margin: 12px 0 0; line-height: 1.5; }
  .note b { color: var(--ink); }
  .note a { text-decoration: underline; }
  .out { margin: -4px 0 0; }

  .steps { list-style: none; display: grid; grid-template-columns: repeat(6, 1fr); margin: 0; padding: 0; }
  .steps li { display: grid; justify-items: center; gap: 4px; text-align: center; position: relative; font-size: 14px; }
  .steps li::before { content: ""; position: absolute; top: 7px; left: -50%; right: 50%; height: 2px; background: var(--line-2); }
  .steps li:first-child::before { display: none; }
  .steps i { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--line-2); background: var(--panel); position: relative; z-index: 1; }
  .steps .done i { border-color: var(--up); background: var(--up); } .steps .done::before { background: var(--up); }
  .steps .today i, .steps .next i { border-color: var(--ink); box-shadow: 0 0 0 4px var(--panel-2); }
  .steps b { font-weight: 700; font-size: 11px; font-stretch: 82%; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; }
  .steps span { font-weight: 600; font-stretch: 90%; font-variant-numeric: tabular-nums; }

  .total { display: flex; align-items: baseline; gap: 7px; font: 850 30px/1 var(--display); font-stretch: 72%; font-variant-numeric: tabular-nums; }
  .total.sm { font-size: 24px; }
  .total small { font: 600 12px var(--font); font-stretch: 85%; color: var(--ink-3); }
  .meters { list-style: none; margin: 0; padding: 0; }
  .meters li { position: relative; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px 12px; padding: 10px 0 13px; border-top: 1px solid var(--line); }
  .meters li:first-child { border-top: 0; }
  .meters em { font-style: normal; color: var(--ink-3); font-size: 12.5px; margin-left: 5px; }
  .meters b { font-variant-numeric: tabular-nums; font-weight: 750; }
  .meters i { position: absolute; left: 0; bottom: 4px; height: 4px; background: var(--ink-3); transition: width 0.5s var(--ease); }
  .meters i.over { background: var(--up); }
  .rows { list-style: none; margin: 0; padding: 0; }
  .rows li { display: flex; justify-content: space-between; gap: 12px; padding: 11px 0; border-top: 1px solid var(--line); }
  .rows li:first-child { border-top: 0; }
  .rows b { font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }

  .chart { width: 100%; height: auto; display: block; }
  .area { fill: var(--up-soft); } .line { stroke: var(--up); stroke-width: 2; } .dot { fill: var(--up); stroke: var(--panel); stroke-width: 2; }
  .axis { display: flex; justify-content: space-between; color: var(--ink-3); font-size: 12px; margin: 4px 0 12px; }
  details { border-top: 1px solid var(--line); }
  summary { cursor: pointer; padding: 12px 0; font-size: 14px; color: var(--ink-2); }
  summary:hover { color: var(--ink); }
  details p { margin: 0 0 12px; color: var(--ink-2); font-family: var(--serif); font-size: 15px; line-height: 1.55; }
  tr.tot td { font-weight: 700; border-top: 1px solid var(--line-2); }
  td.within { padding-left: 24px; color: var(--ink-2); } td em { color: var(--ink-3); font-style: normal; font-size: 12px; margin-left: 4px; }
  td.up { color: var(--up); font-weight: 650; }

  .kv { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0 36px; }
  .kv > div { display: flex; justify-content: space-between; gap: 16px; padding: 10px 0; border-top: 1px solid var(--line); }
  .kv > .wide { grid-column: 1 / -1; }
  .kv dt { flex: none; text-transform: none; letter-spacing: 0; font-size: 14px; font-weight: 450; font-stretch: normal; }
  .kv dd { margin: 0; text-align: right; font-size: 14.5px; }
  .kv a { text-decoration: underline; }

  .answers > div { display: grid; grid-template-columns: 210px 1fr; gap: 16px; padding: 11px 0; border-top: 1px solid var(--line); }
  .answers > div:first-child { border-top: 0; padding-top: 0; }
  .answers dt { text-transform: none; letter-spacing: 0; font-size: 14.5px; font-weight: 650; font-stretch: 90%; color: var(--ink); }
  .answers dd { margin: 0; font-family: var(--serif); font-size: 15px; font-weight: 400; font-stretch: normal; line-height: 1.5; color: var(--ink-2); }

  .growth { font-size: 14px; font-weight: 650; font-stretch: 88%; color: var(--ink-2); }
  .bars { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 0; margin-bottom: 18px; border: 1px solid var(--line); }
  figure { margin: 0; padding: 14px; border-right: 1px solid var(--line); }
  figure:last-child { border-right: 0; }
  figcaption { font-size: 11px; font-weight: 700; font-stretch: 82%; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-3); }
  .headline { display: flex; align-items: baseline; gap: 7px; margin: 5px 0 12px; font: 850 25px/1.05 var(--display); font-stretch: 72%; font-variant-numeric: tabular-nums; }
  .headline small { font: 500 12px var(--font); color: var(--ink-3); }
  .bar-row { display: flex; gap: 8px; align-items: flex-end; min-height: 86px; }
  .bar { flex: 1; display: grid; justify-items: center; gap: 4px; align-content: end; }
  .bar i { display: block; width: 100%; max-width: 44px; background: var(--ink-3); }
  .bar:last-child i { background: var(--up); }
  .bar i.neg { background: var(--down); }
  .bar .yr { font-size: 11.5px; color: var(--ink-3); font-variant-numeric: tabular-nums; }

  .objects { margin: 0; padding: 0 0 0 26px; }
  .objects li { padding: 11px 0; border-top: 1px solid var(--line); }
  .objects li:first-child { border-top: 0; }
  .objects li::marker { font-weight: 800; color: var(--up); font-variant-numeric: tabular-nums; }
  .objects li { display: list-item; }
  .objects b { float: right; margin-left: 16px; font-variant-numeric: tabular-nums; }

  .columns { columns: 2 380px; column-gap: 36px; }
  .columns .prose { break-inside: avoid-column; }
  .prose { margin: 0 0 12px; max-width: 75ch; font-size: 16px; line-height: 1.6; color: var(--ink-2); }
  .plainlist { margin: 0; padding-left: 18px; color: var(--ink-2); }
  .bul { margin: 0; padding-left: 18px; display: grid; gap: 10px; font-family: var(--serif); font-size: 15px; line-height: 1.5; color: var(--ink-2); }
  .bul.up li::marker { color: var(--up); } .bul.down li::marker { color: var(--down); }

  .docs { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); border: 1px solid var(--line); border-right: 0; border-bottom: 0; }
  .docs a { display: flex; justify-content: space-between; gap: 12px; padding: 13px 14px; font-weight: 600; font-stretch: 92%; font-size: 14.5px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); height: 100%; box-sizing: border-box; }
  .docs a:hover { background: var(--panel-2); }

  .all { font-size: 14px; font-weight: 650; }
  .all:hover { text-decoration: underline; }
  .recent { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 0 28px; }
  .recent a { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid var(--line); font-size: 14.5px; font-weight: 600; font-stretch: 92%; }
  .recent a:hover span { text-decoration: underline; }
  .recent span { flex: 1; min-width: 0; line-height: 1.2; }
  .recent b { font-variant-numeric: tabular-nums; font-size: 13.5px; }

  .source { font-size: 12.5px; line-height: 1.6; margin-top: 4px; }
  .source a { text-decoration: underline; }

  @media (max-width: 900px) {
    .duo { grid-template-columns: minmax(0, 1fr); }
    .perf { grid-template-columns: repeat(3, 1fr); }
    .perf > div:nth-child(3) { border-right: 0; }
    .perf .loud { grid-column: span 1; border-top: 1px solid var(--line); }
    .perf > div:nth-child(4) { grid-column: 1 / 3; }
  }
  @media (max-width: 640px) {
    .box { padding: 15px 14px; }
    .hero { padding: 0; }
    .top { padding: 16px 14px; }
    .big { text-align: left; }
    .four { grid-template-columns: repeat(2, 1fr); }
    .four > div:nth-child(2n) { border-right: 0; }
    .four > div:nth-child(4n) { border-right: 0; }
    .hero .cells > div { padding: 11px 14px; }
    .hero .cells > div:nth-last-child(-n + 4) { border-bottom: 1px solid var(--line); }
    .hero .cells > div:nth-last-child(-n + 2) { border-bottom: 0; }
    .perf { grid-template-columns: repeat(2, 1fr); }
    .perf > div { border-bottom: 1px solid var(--line); }
    .perf > div:nth-child(3) { grid-column: 1 / -1; border-right: 0; }
    .perf > div:nth-child(1) { border-right: 1px solid var(--line); }
    .perf > div:nth-child(2) { border-right: 0; }
    .perf > div:nth-child(4) { grid-column: auto; border-top: 0; }
    .perf .loud { border-top: 0; border-bottom: 0; }
    .steps { grid-template-columns: repeat(3, 1fr); row-gap: 14px; } .steps li:nth-child(4)::before { display: none; }
    .kv { grid-template-columns: 1fr; }
    .answers > div { grid-template-columns: 1fr; gap: 3px; }
    .bars { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    figure { padding: 12px; border-bottom: 1px solid var(--line); }
    figure:nth-child(2n) { border-right: 0; }
    figure:nth-last-child(-n + 2) { border-bottom: 0; }
    figcaption { min-height: 2.4em; }
    .headline { display: block; font-size: 21px; }
    .headline small { display: block; margin-top: 2px; }
    .subnav { top: 49px; }
  }
</style>
