<script lang="ts">
  import { page } from "$app/state";
  import { onMount, untrack } from "svelte";
  import ProChart from "$lib/components/ProChart.svelte";
  import StockReading from "$lib/components/StockReading.svelte";
  import StockOverview from "$lib/components/StockOverview.svelte";
  import StockForecast from "$lib/components/StockForecast.svelte";
  import StockNews from "$lib/components/StockNews.svelte";
  import TechnicalPanel from "$lib/components/TechnicalPanel.svelte";
  import PriceVolume from "$lib/components/PriceVolume.svelte";
  import SeasonalityPanel from "$lib/components/SeasonalityPanel.svelte";
  import IndustryCompare from "$lib/components/IndustryCompare.svelte";
  import StatementTable from "$lib/components/StatementTable.svelte";
  import StockTable from "$lib/components/StockTable.svelte";
  import FilingList from "$lib/components/FilingList.svelte";
  import LiveBadge from "$lib/components/LiveBadge.svelte";
  import Logo from "$lib/components/Logo.svelte";
  import { BRAND } from "$lib/brand";
  import { compact, crore, date, num, pct, price, tone } from "$lib/format";
  import { near } from "$lib/near";
  import { readStock } from "$lib/stock-reading";
  import { live, tradeTime, watch } from "$lib/live.svelte";
  import { session } from "$lib/session.svelte";

  let { data } = $props();
  const c = $derived(data.company);
  const m = $derived(c.metrics ?? {});
  const bseOnly = $derived(data.bseOnly);
  const shortSymbol = $derived(c.bse_symbol ?? c.symbol);

  // Live price from Dhan when this account has live access; end-of-day close otherwise.
  // Live only while the market is open; otherwise NSE's closing price.
  const liveNow = $derived(!!data.live && session.open && !bseOnly);
  $effect(() => (liveNow ? watch([c.symbol]) : undefined));
  const lq = $derived(liveNow ? live.quotes[c.symbol] : undefined);

  // ── Sections: one long page; the rail jumps to each and marks the one being read ──
  const SECTIONS = [
    { key: "overview", label: "Overview" },
    { key: "chart", label: "Chart" },
    { key: "forecast", label: "Forecast" },
    { key: "technicals", label: "Technicals" },
    { key: "price-volume", label: "Price & Volume" },
    { key: "seasonality", label: "Seasonality" },
    { key: "news", label: "News" },
    { key: "financials", label: "Financials" },
    { key: "shareholding", label: "Shareholding" },
    { key: "filings", label: "Filings" },
    { key: "peers", label: "Peers" },
  ] as const;
  type Section = (typeof SECTIONS)[number]["key"];
  let active = $state<Section>("overview");
  let rail = $state<HTMLElement>();
  // Statements and filings load at a visitor's first sign of life, ahead of the scroll that reaches
  // them, rather than on render: crawlers walking every stock page shouldn't spend the plan or call NSE.
  let engaged = $state(false);
  // Statements and filings are several requests between them, so they also wait until their section
  // is coming into view. Someone reading the price and chart on a phone never pays for them.
  let financialsNear = $state(false);
  let filingsNear = $state(false);
  // The company's description and the written summary fold to a few lines on a phone.
  let aboutOpen = $state(false);
  // Sections above a jump's target can grow while it scrolls, as their data arrives. Until that
  // settles, or the reader scrolls for themselves, the page keeps aiming at the target.
  let root = $state<HTMLElement>();
  let aimAt: string | null = null;
  let aimTimer: ReturnType<typeof setTimeout>;
  function aim(key: string) {
    engaged = true;
    aimAt = key;
    clearTimeout(aimTimer);
    aimTimer = setTimeout(() => (aimAt = null), 4000);
  }
  onMount(() => {
    const engage = () => (engaged = true);
    const signs = ["pointermove", "pointerdown", "touchstart", "keydown", "wheel", "scroll"];
    for (const s of signs) addEventListener(s, engage, { once: true, passive: true });

    const stopAiming = () => (aimAt = null);
    const ownScroll = ["wheel", "touchmove", "keydown"];
    for (const s of ownScroll) addEventListener(s, stopAiming, { passive: true });
    const growth = new ResizeObserver(() => {
      if (aimAt) document.getElementById(aimAt)?.scrollIntoView({ behavior: "instant" });
    });
    growth.observe(root!);

    // Older links and bookmarks say ?tab=; a #section the browser has already scrolled to.
    const wanted = location.hash.slice(1) || page.url.searchParams.get("tab");
    if (SECTIONS.some((s) => s.key === wanted)) {
      engage();
      aim(wanted!);
      if (!location.hash) document.getElementById(wanted!)?.scrollIntoView({ behavior: "instant" });
    }

    let frame = 0;
    const mark = () => {
      frame = 0;
      const line = (rail?.getBoundingClientRect().bottom ?? 0) + 24;
      let now: Section = "overview";
      for (const s of SECTIONS) if ((document.getElementById(s.key)?.getBoundingClientRect().top ?? Infinity) <= line) now = s.key;
      // The last section may be too short to ever reach the line.
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) now = "peers";
      active = now;
    };
    const onScroll = () => (frame ||= requestAnimationFrame(mark));
    addEventListener("scroll", onScroll, { passive: true });
    mark();
    return () => {
      for (const s of signs) removeEventListener(s, engage);
      for (const s of ownScroll) removeEventListener(s, stopAiming);
      growth.disconnect();
      clearTimeout(aimTimer);
      removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  });
  // On a phone the rail scrolls sideways; keep the marked section in it.
  $effect(() => {
    const link = rail?.querySelector<HTMLElement>(`[href="#${active}"]`);
    // Instant: a second smooth scroll here could interrupt the page's own.
    if (link) rail!.scrollTo({ left: link.offsetLeft - 16, behavior: "instant" });
  });

  // ── About, news, long-history figures and the session's quote ──
  // Loaded in the browser for people, not during the server render, so crawlers don't spend the plans.
  type Desk = { quote: any | null; stats: any | null; digest: any | null };
  let desk = $state<Desk>({ quote: null, stats: null, digest: null });
  let deskLoading = $state(true);
  const isBot = () => typeof navigator !== "undefined" && (navigator.webdriver || /bot|crawl|spider|slurp|lighthouse|headless/i.test(navigator.userAgent));
  $effect(() => {
    const sym = c.symbol;
    desk = { quote: null, stats: null, digest: null };
    deskLoading = true;
    if (isBot()) {
      deskLoading = false;
      return;
    }
    let stale = false;
    fetch(`/stock/${encodeURIComponent(sym)}/desk`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d) => {
        if (stale) return;
        if (d) desk = { quote: d.quote, stats: d.stats, digest: d.digest };
        deskLoading = false;
      });
    return () => (stale = true);
  });
  // While the market is open, a BSE stock's price is polled: the live feed carries NSE only. NSE's limits and VWAP refresh with it.
  $effect(() => {
    const sym = c.symbol;
    if (!session.open || isBot()) return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      fetch(`/stock/${encodeURIComponent(sym)}/desk?only=quote`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.quote && sym === c.symbol) desk.quote = d.quote;
        })
        .catch(() => {});
    }, 20_000);
    return () => clearInterval(timer);
  });
  const digest = $derived(desk.digest);
  const chartTick = $derived(lq ? { ltp: lq.ltp, volume: lq.volume } : session.open && desk.quote?.ltp ? { ltp: desk.quote.ltp, volume: desk.quote.volume } : null);
  const headPrice = $derived(bseOnly && desk.quote?.ltp && session.open ? desk.quote.ltp : m.close);
  const headChange = $derived(bseOnly && desk.quote?.ltp && desk.quote?.prev_close && session.open ? ((desk.quote.ltp - desk.quote.prev_close) / desk.quote.prev_close) * 100 : m.change_pct);

  // ── Quarterly results + shareholding (imported, or from the provider in the browser) ──
  let extFund = $state<{ periods: any[]; quarters: any[]; fetched_at: string | null } | null>(null);
  let extLoading = $state(false);
  $effect(() => {
    const sym = c.symbol;
    extFund = null;
    extLoading = false;
    if (!engaged || (data.financials.periods.length && data.shareholding.quarters.length)) return;
    extLoading = true;
    let stale = false;
    fetch(`/stock/${encodeURIComponent(sym)}/fundamentals`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d) => {
        if (stale) return;
        extFund = d;
        extLoading = false;
      });
    return () => (stale = true);
  });
  const quarters = $derived(data.financials.periods.length ? data.financials.periods : (extFund?.periods ?? [])); // newest first
  const sh = $derived(data.shareholding.quarters.length ? data.shareholding.quarters : (extFund?.quarters ?? []));
  const latestSh = $derived(sh[0]);
  const hasPledge = $derived(sh.some((q: any) => q.pledged_pct != null));
  const reading = $derived(readStock({ m, quote: desk.quote, info: data.industryInfo, stats: desk.stats, digest, quarters, holding: sh, bseOnly }));

  // ── Full statements, fetched ahead of the Financials section ──
  const STATEMENTS = [
    { key: "quarter_results", label: "Quarterly", growth: ["Sales", "Revenue", "Net Profit"], lag: 4 },
    { key: "yoy_results", label: "Profit & loss", growth: ["Sales", "Revenue", "Net Profit"], lag: 1 },
    { key: "balancesheet", label: "Balance sheet", growth: [], lag: 1 },
    { key: "cashflow", label: "Cash flow", growth: [], lag: 1 },
    { key: "ratios", label: "Ratios", growth: [], lag: 1 },
  ] as const;
  type StatementKey = (typeof STATEMENTS)[number]["key"];
  type Statement = { periods: string[]; rows: any[]; fetched_at?: string | null; error?: string };
  let statementKey = $state<StatementKey>("quarter_results");
  let statements = $state<Record<string, Statement | "loading" | null>>({});
  $effect(() => {
    void c.symbol;
    statements = {};
  });
  function loadStatement(key: StatementKey) {
    if (statements[key] !== undefined) return Promise.resolve();
    const sym = c.symbol;
    statements[key] = "loading";
    return fetch(`/stock/${encodeURIComponent(sym)}/statements?stats=${key}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d) => {
        if (sym === c.symbol) statements[key] = d?.rows?.length ? d : null;
      });
  }
  $effect(() => {
    if (!engaged || !financialsNear) return;
    const sym = c.symbol;
    // One first: it stores the company's whole bundle, so the rest don't each ask the provider.
    untrack(() => loadStatement("quarter_results")).then(() => {
      if (sym === c.symbol) for (const s of STATEMENTS) loadStatement(s.key);
    });
  });
  const current = $derived(statements[statementKey]);

  // ── Filings, corporate actions and meetings, fetched ahead of the Filings section ──
  type FilingsData = { filings: any[] | null; kinds: Record<string, string>; counts: Record<string, number>; actions: any[] | null; events: any[] | null; fetched_at: string | null };
  let filingsData = $state<FilingsData | "loading" | null | undefined>(undefined);
  let filingKind = $state("");
  // A year of filings would bury Peers below it, so these open short.
  const SHORT_LIST = 10;
  let allFilings = $state(false);
  let allActions = $state(false);
  $effect(() => {
    void c.symbol;
    filingsData = undefined;
    filingKind = "";
    allFilings = allActions = false;
  });
  $effect(() => {
    if (!engaged || !filingsNear || filingsData !== undefined) return;
    const sym = c.symbol;
    // Filings come from NSE's site, which has nothing for a stock listed only on BSE.
    if (bseOnly) {
      filingsData = null;
      return;
    }
    filingsData = "loading";
    fetch(`/stock/${encodeURIComponent(sym)}/filings`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d) => {
        if (sym === c.symbol) filingsData = d;
      });
  });
  const fd = $derived(filingsData && filingsData !== "loading" ? filingsData : null);
  const shownFilings = $derived((fd?.filings ?? []).filter((f: any) => !filingKind || f.kind === filingKind));
  const shownActions = $derived(fd?.actions ?? []);
  const spec = $derived(STATEMENTS.find((s) => s.key === statementKey)!);

  // ── Summary: plain facts from the figures on this page ──
  const moved = (v: number) => (v >= 0 ? "rose" : "fell");
  const summary = $derived.by(() => {
    if (m.close == null) return "";
    const parts = [`${c.name} (${shortSymbol}) closed at ${price(m.close)} on ${date(m.as_of)}${m.change_pct != null ? `, ${m.change_pct >= 0 ? "up" : "down"} ${Math.abs(m.change_pct).toFixed(2)}% on the day` : ""}.`];
    if (m.ret_1y != null) parts.push(`The share price ${moved(m.ret_1y)} ${Math.abs(m.ret_1y).toFixed(1)}% over the past year (adjusted for splits and bonuses)${m.pct_from_high != null && m.pct_from_high < -0.5 ? ` and sits ${Math.abs(m.pct_from_high).toFixed(1)}% below its highest close of the past year, ${price(m.high_52w)}` : m.pct_from_high != null ? " and trades at its 52-week high" : ""}.`);
    const [q0, , , , q4] = quarters;
    if (q0 && q4 && q0.revenue != null && q4.revenue && q0.net_profit != null && q4.net_profit) {
      const rg = ((q0.revenue - q4.revenue) / Math.abs(q4.revenue)) * 100;
      const pg = ((q0.net_profit - q4.net_profit) / Math.abs(q4.net_profit)) * 100;
      const qName = new Date(`${q0.period_end}T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
      parts.push(`In the ${qName} quarter, revenue ${moved(rg)} ${Math.abs(rg).toFixed(1)}% year on year to ₹${num(q0.revenue, 0)} Cr and net profit ${moved(pg)} ${Math.abs(pg).toFixed(1)}% to ₹${num(q0.net_profit, 0)} Cr.`);
    }
    if (latestSh?.promoter != null) {
      const prev = sh[1]?.promoter;
      const d = prev != null ? latestSh.promoter - prev : null;
      const shMonth = new Date(`${latestSh.quarter_end}T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
      parts.push(`Promoters held ${latestSh.promoter.toFixed(2)}% at the end of ${shMonth}${d == null ? "" : Math.abs(d) < 0.005 ? ", unchanged from the quarter before" : `, ${d > 0 ? "up" : "down"} ${Math.abs(d).toFixed(2)} points from the quarter before`}.`);
    }
    return parts.join(" ");
  });

  const SH_PARTS = [
    { key: "promoter", label: "Promoters", color: "var(--brand)" },
    { key: "fii", label: "FII / FPI", color: "var(--series)" },
    { key: "dii", label: "DII", color: "#a8661a" },
    { key: "government", label: "Government", color: "#6b4a7a" },
    { key: "public", label: "Public", color: "var(--line-2)" },
    { key: "others", label: "Others", color: "var(--ink-3)" },
  ];
</script>

<svelte:head><title>{shortSymbol} · {c.name} — {BRAND}</title></svelte:head>

<div class="page" bind:this={root}>
  <!-- Identity and price -->
  <header class="head">
    <div class="who">
      <Logo isin={c.isin} symbol={c.symbol} size={52} />
      <div>
        <h1>{c.name}</h1>
        <p class="ids">
          <span class="mono">{bseOnly ? "BSE" : "NSE"}: {shortSymbol}</span>
          {#if c.isin}<span class="mono">{c.isin}</span>{/if}
          {#if c.sector}<a class="chip" href="/sectors/{encodeURIComponent(c.sector)}">{c.sector}</a>{/if}
        </p>
      </div>
    </div>
    <div class="quote">
      {#if lq}
        <div class="px">{price(lq.ltp)}</div>
        <div class="chg {tone(lq.change)}">{lq.change != null && lq.change > 0 ? "+" : ""}{num(lq.change)} ({pct(lq.changePct)}) <LiveBadge /></div>
        <div class="sub dayline">O {num(lq.open)} · H {num(lq.high)} · L {num(lq.low)} · Vol {compact(lq.volume)} · {tradeTime(lq.ltt)} IST</div>
      {:else}
        <div class="px">{price(headPrice)}</div>
        <div class="chg {tone(headChange)}">{pct(headChange)} <span class="sub">· {bseOnly && session.open && desk.quote?.ltp ? "BSE, about 20 seconds old" : `close ${date(m.as_of)}`}</span>{#if liveNow} <LiveBadge />{/if}</div>
      {/if}
    </div>
  </header>

  <!-- Phones: the figures people come for, straight under the price. -->
  <dl class="keyline">
    {#if m.ret_1y != null}<div><dt>1 year</dt><dd class={tone(m.ret_1y)}>{pct(m.ret_1y)}</dd></div>{/if}
    {#if m.high_52w != null}<div><dt>52W high</dt><dd>{price(m.high_52w)}</dd></div>{/if}
    {#if m.low_52w != null}<div><dt>52W low</dt><dd>{price(m.low_52w)}</dd></div>{/if}
    {#if m.pe != null}<div><dt>P/E</dt><dd>{num(m.pe, 1)}</dd></div>{/if}
  </dl>

  <section class="about" class:open={aboutOpen} aria-label="About the company">
    <div class="biz">
      <h2>About {c.name}</h2>
      {#if digest?.about}
        <p class="story">{digest.about}</p>
      {:else if deskLoading}
        <p class="story waiting" role="status">Loading what this company does…</p>
      {:else}
        <p class="story waiting">A description of this company isn't available from our source right now.{#if digest?.industry ?? c.sector}{" "}It is classed under {digest?.industry ?? c.sector}.{/if}</p>
      {/if}
      {#if digest?.officers?.length}
        <ul class="people">
          {#each digest.officers.slice(0, 3) as o}<li><b>{o.name}</b>{#if o.title} · {o.title}{/if}</li>{/each}
        </ul>
      {/if}
    </div>
    {#if summary}
      <div class="moving">
        <h2>How the stock has moved</h2>
        <p>{summary}{#if extLoading && !data.financials.periods.length}<span class="sub"> Loading quarterly figures…</span>{/if}</p>
        {#if digest?.news?.[0]}
          <p class="latest"><b>In the news:</b> <a href={digest.news[0].url} target="_blank" rel="noopener noreferrer">{digest.news[0].headline}</a></p>
        {/if}
      </div>
    {/if}
    <button type="button" class="read-more" aria-expanded={aboutOpen} onclick={() => (aboutOpen = !aboutOpen)}>{aboutOpen ? "Show less" : "Read more"}</button>
  </section>

  <StockReading {reading} />

  <!-- Section rail: jumps down this one page -->
  <nav class="sections" aria-label="Stock sections" bind:this={rail}>
    <div class="tabs">
      {#each SECTIONS as s}
        <a href="#{s.key}" aria-current={active === s.key ? "true" : undefined} onclick={() => aim(s.key)}>{s.label}</a>
      {/each}
    </div>
  </nav>

  <div id="overview" class="block">
    <StockOverview f={reading.figures} {m} quote={desk.quote} stats={desk.stats} faceValue={c.face_value ?? null} {bseOnly} />
  </div>

  <div id="chart" class="block">
    <h2>Chart</h2>
    <section class="chart-card">
      <ProChart symbol={c.symbol} name={c.name} tick={chartTick} actions={digest?.actions ?? []} />
      <p class="sub note">Candles from Dhan, {bseOnly ? "BSE" : "NSE"} prices, times in IST. Past prices are adjusted for splits and bonuses. Your drawings and settings stay in this browser.</p>
    </section>
  </div>

  <div id="forecast" class="block">
    <h2>Forecast</h2>
    <StockForecast analysts={digest?.analysts ?? null} loading={deskLoading} />
  </div>

  <div id="technicals" class="block">
    <h2>Technicals</h2>
    <TechnicalPanel technicals={desk.stats?.technicals ?? null} loading={deskLoading} />
    {#if m.cross_signal || m.breakout || (m.vol_ratio ?? 0) >= 3}
      <p class="signals">
        {#if m.cross_signal}<span class="chip {m.cross_signal === 'golden' ? 'up' : 'down'}">{m.cross_signal} cross · {date(m.cross_date)}</span>{/if}
        {#if m.breakout}<span class="chip {m.breakout === 'high' ? 'up' : 'down'}">52W {m.breakout === "high" ? "breakout" : "breakdown"}</span>{/if}
        {#if (m.vol_ratio ?? 0) >= 3}<span class="chip">volume spike · {num(m.vol_ratio, 1)}x</span>{/if}
      </p>
    {/if}
  </div>

  <div id="price-volume" class="block">
    <h2>Price &amp; Volume</h2>
    <PriceVolume stats={desk.stats} loading={deskLoading} />
  </div>

  <div id="seasonality" class="block">
    <h2>Seasonality</h2>
    <SeasonalityPanel stats={desk.stats} name={c.name} loading={deskLoading} />
  </div>

  <div id="news" class="block">
    <h2>News</h2>
    <StockNews news={digest?.news ?? []} name={c.name} loading={deskLoading} />
  </div>

  {#if data.industryInfo}
    <div class="block">
      <IndustryCompare info={data.industryInfo} industry={c.sector} />
    </div>
  {/if}

  <div id="financials" class="block" use:near={() => (financialsNear = true)}>
    <h2>Financials</h2>
    <section class="card">
      <div class="card-head">
        <div class="tabs" role="tablist" aria-label="Statement">
          {#each STATEMENTS as s}
            <button role="tab" aria-selected={statementKey === s.key} class:active={statementKey === s.key} onclick={() => (statementKey = s.key)}>{s.label}</button>
          {/each}
        </div>
        <span class="sub">INR crore · consolidated where filed</span>
      </div>
      {#if current === "loading" || current === undefined}
        <!-- Holds roughly the table's height, so the page doesn't jump when the figures arrive. -->
        <div class="table-skeleton" role="status" aria-label="Loading the {spec.label.toLowerCase()} for {c.symbol}">
          {#each { length: 13 } as _}<i></i>{/each}
        </div>
      {:else if current}
        <StatementTable periods={current.periods} rows={current.rows} growthFor={[...spec.growth]} lag={spec.lag} />
      {:else}
        <div class="empty">The {spec.label.toLowerCase()} for {c.symbol} isn't available right now.</div>
      {/if}
    </section>
    <p class="sub small">Source: Indian Stock API, from company filings. Annual columns are financial years; TTM is the trailing twelve months.</p>
  </div>

  <div id="shareholding" class="block">
    <h2>Shareholding</h2>
    <section class="card">
      {#if latestSh}<div class="card-head"><span class="sub">as of {date(latestSh.quarter_end)}</span></div>{/if}
      {#if latestSh}
        <div class="card-body">
          <div class="stack" aria-hidden="true">
            {#each SH_PARTS as p}{#if latestSh[p.key]}<span style="width: {latestSh[p.key]}%; background: {p.color}"></span>{/if}{/each}
          </div>
        </div>
        <div class="table-scroll">
          <table>
            <thead><tr><th>Holder</th>{#each sh as q}<th>{date(q.quarter_end)}</th>{/each}</tr></thead>
            <tbody>
              {#each SH_PARTS.filter((p) => sh.some((q: any) => q[p.key] != null)) as p}
                <tr><td><i class="dot" style="background: {p.color}"></i>{p.label}</td>{#each sh as q}<td>{pct(q[p.key], false)}</td>{/each}</tr>
              {/each}
              {#if hasPledge}<tr><td>Promoter shares pledged</td>{#each sh as q}<td>{pct(q.pledged_pct, false)}</td>{/each}</tr>{/if}
            </tbody>
          </table>
        </div>
      {:else}
        <div class="empty">{bseOnly ? "Shareholding isn't available here for stocks listed only on BSE yet." : extLoading || !engaged ? `Loading shareholding for ${c.symbol}…` : `Shareholding for ${c.symbol} isn't available right now.`}</div>
      {/if}
    </section>
  </div>

  <div id="filings" class="block" use:near={() => (filingsNear = true)}>
    <h2>Filings</h2>
    {#if !bseOnly && (filingsData === "loading" || filingsData === undefined)}
      <!-- Holds roughly the lists' height, so the page doesn't jump when they arrive. -->
      <div class="card empty filings-loading">Loading {c.symbol}'s filings from NSE…</div>
    {:else if !fd}
      {#if bseOnly}
        <div class="card empty">Exchange filings aren't available here for stocks listed only on BSE yet.</div>
        {#if digest?.actions?.length}
          <section class="card">
            <div class="card-head"><h2>Corporate actions</h2><span class="sub">dividends, bonuses, splits</span></div>
            <div class="table-scroll">
              <table>
                <thead><tr><th>Ex-date</th><th class="left">Action</th></tr></thead>
                <tbody>{#each digest.actions.slice(0, SHORT_LIST) as a}<tr><td>{date(a.date)}</td><td class="left">{a.text}</td></tr>{/each}</tbody>
              </table>
            </div>
          </section>
        {/if}
      {:else}
        <div class="card empty">{c.symbol}'s filings aren't available from NSE right now.</div>
      {/if}
    {:else}
      {#if fd.events?.length}
        <div class="notice next">
          Next board meeting: <b>{date(fd.events[0].date)}</b> · {fd.events[0].purpose}. <span class="sub">{fd.events[0].details}</span>
        </div>
      {/if}
      <section class="card">
        <div class="card-head">
          <div class="tabs" role="tablist" aria-label="Kind of filing">
            <button role="tab" aria-selected={!filingKind} class:active={!filingKind} onclick={() => (filingKind = "")}>All</button>
            {#each Object.entries(fd.counts).filter(([, n]) => n) as [k]}
              <button role="tab" aria-selected={filingKind === k} class:active={filingKind === k} onclick={() => (filingKind = k)}>{fd.kinds[k]}</button>
            {/each}
          </div>
          <span class="sub">last 12 months · PDFs from NSE</span>
        </div>
        <FilingList filings={allFilings ? shownFilings : shownFilings.slice(0, SHORT_LIST)} kinds={fd.kinds} showCompany={false} empty="No filings of this kind in the last year." />
        {#if !allFilings && shownFilings.length > SHORT_LIST}
          <button class="btn small more" onclick={() => (allFilings = true)}>Show all {shownFilings.length} filings</button>
        {/if}
      </section>
      <section class="card">
        <div class="card-head"><h2>Corporate actions</h2><span class="sub">dividends, bonuses, splits</span></div>
        {#if shownActions.length}
          <div class="table-scroll">
            <table>
              <thead><tr><th>Ex-date</th><th class="left">Action</th><th>Record date</th></tr></thead>
              <tbody>
                {#each allActions ? shownActions : shownActions.slice(0, SHORT_LIST) as a, i (a.subject + i)}
                  <tr><td>{date(a.ex_date)}</td><td class="left">{a.subject}</td><td>{date(a.record_date)}</td></tr>
                {/each}
              </tbody>
            </table>
          </div>
          {#if !allActions && shownActions.length > SHORT_LIST}
            <button class="btn small more" onclick={() => (allActions = true)}>Show all {shownActions.length} actions</button>
          {/if}
        {:else}
          <div class="empty">No corporate actions on record for {c.symbol}.</div>
        {/if}
      </section>
    {/if}
  </div>

  <div id="peers" class="block">
    <h2>Peers{c.sector ?? digest?.industry ? ` in ${c.sector ?? digest?.industry}` : ""}</h2>
    <section class="card">
      {#if c.peers?.length}
        <StockTable rows={c.peers} cols={["close", "change_pct", "ret_1m", "ret_1y", "pe"]} logos />
      {:else if digest?.peers?.length}
        <div class="table-scroll">
          <table>
            <thead><tr><th class="left">Company</th><th>Price</th><th>Change</th><th>P/E</th><th>P/B</th><th>Market cap</th></tr></thead>
            <tbody>
              {#each digest.peers as p}
                <tr><td class="left">{p.name}</td><td>{price(p.price)}</td><td class={tone(p.change_pct)}>{pct(p.change_pct)}</td><td>{num(p.pe, 1)}</td><td>{num(p.pb, 2)}</td><td>{p.market_cap_cr != null ? `₹${num(p.market_cap_cr, 0)} Cr` : "—"}</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <div class="empty">No sector peers for {c.symbol}.</div>
      {/if}
    </section>
  </div>
</div>

<style>
  /* One section of the page. The scroll margin clears the two sticky rails above it. */
  .block { display: grid; grid-template-columns: minmax(0, 1fr); gap: 34px; scroll-margin-top: calc(var(--chrome-top) + 59px); }
  .block > h2 { margin-bottom: -22px; padding-top: 14px; border-top: var(--rule-heavy); font-size: 30px; font-weight: 850; font-stretch: 66%; line-height: 1; }
  .filings-loading { min-height: 480px; }
  .more { margin-top: 12px; }
  .table-skeleton { display: grid; }
  .table-skeleton i { height: 37px; border-bottom: 1px solid var(--line); background: linear-gradient(var(--panel-2), var(--panel-2)) no-repeat 0 50% / 180px 12px; }
  .head { display: grid; grid-template-columns: 1fr auto; gap: 18px 24px; align-items: start; }
  .who { display: flex; gap: 16px; align-items: center; min-width: 0; }
  .ids { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; margin-top: 6px; color: var(--ink-3); font-size: 12.5px; }
  .ids .chip { color: var(--brand-2); background: var(--brand-soft); }
  .quote { text-align: right; }
  .px { font: 850 52px/0.95 var(--display); font-stretch: 66%; }
  .chg { font: 700 15px var(--font); font-stretch: 85%; display: flex; gap: 8px; align-items: center; justify-content: flex-end; margin-top: 4px; }
  .chg .sub { font-family: var(--font); }
  .dayline { font-size: 12px; margin-top: 4px; font-stretch: 85%; }
  .about { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 20px 44px; padding-top: 12px; border-top: var(--rule-heavy); }
  .about h2 { margin: 0 0 6px; font: 800 18px var(--display); font-stretch: 78%; }
  .story { margin: 0; font: 16.5px/1.55 var(--serif); color: var(--ink); max-width: 72ch; }
  .story.waiting { color: var(--ink-3); }
  .people { display: flex; flex-wrap: wrap; gap: 4px 18px; margin: 10px 0 0; padding: 0; list-style: none; color: var(--ink-2); font-size: 13px; }
  .people b { font-weight: 700; color: var(--ink); }
  .moving p { margin: 0; font: 15.5px/1.5 var(--serif); color: var(--ink-2); }
  .moving .latest { margin-top: 10px; font: 14px/1.45 var(--font); }
  .moving a { color: var(--ink); text-decoration: underline; text-decoration-color: var(--line-2); text-underline-offset: 3px; }
  .moving a:hover { text-decoration-color: currentColor; }
  .chart-card .note { margin-top: 8px; }
  .signals { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; }

  /* Section rail under the stock's name: printed section heads, the one being read underlined in ink. */
  .sections { position: sticky; top: var(--chrome-top); z-index: 5; background: var(--bg); border-bottom: 1px solid var(--ink); }
  .sections .tabs { gap: 28px; border: 0; overflow: visible; }
  .sections .tabs a { position: relative; padding: 12px 0; border: 0; background: none; color: var(--ink-2); font-size: 13.5px; }
  .sections .tabs a:hover { background: none; color: var(--ink); }
  .sections .tabs [aria-current="true"], .sections .tabs [aria-current="true"]:hover { background: none; color: var(--ink); }
  .sections .tabs [aria-current="true"]::after { content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 4px; background: var(--ink); }
  /* Between tablet and wide desktop the section names outgrow the page; let them scroll, not clip. */
  @media (max-width: 1180px) {
    .sections { overflow-x: auto; scrollbar-width: none; }
    .sections .tabs { width: max-content; max-width: none; }
    .sections .tabs a { white-space: nowrap; }
  }
  .keyline, .read-more { display: none; }
  @media (max-width: 860px) {
    .sections { overflow-x: auto; scrollbar-width: none; margin: 0 -16px; padding: 0 16px; }
    .sections .tabs { gap: 20px; overflow: visible; max-width: none; }
    .sections .tabs a { padding: 13px 0; white-space: nowrap; }
    .block { gap: 22px; scroll-margin-top: calc(var(--chrome-top) + 52px); }
    .block > h2 { margin-bottom: -10px; font-size: 26px; }
    /* A long page: sections off screen skip layout and paint until they come near. */
    #forecast, #technicals, #price-volume, #seasonality, #news, #shareholding, #peers { content-visibility: auto; contain-intrinsic-size: auto 520px; }
    /* Phone order: who and how much, the keyline, the section rail, then the reading. */
    .head { order: -5; }
    .keyline { order: -4; display: grid; grid-template-columns: repeat(auto-fit, minmax(68px, 1fr)); margin: -10px 0 0; border-top: 1px solid var(--ink); border-bottom: var(--rule); }
    .keyline div { padding: 8px 8px 8px 0; min-width: 0; }
    .keyline dt { font-size: var(--text-micro); font-weight: 700; font-stretch: 82%; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-3); }
    .keyline dd { margin: 2px 0 0; font-size: 14.5px; font-weight: 750; font-stretch: 82%; white-space: nowrap; }
    .sections { order: -3; margin-top: -14px; }
    .about { padding-top: 0; border-top: 0; gap: 14px; }
    .about:not(.open) .story, .about:not(.open) .moving > p:first-of-type { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; line-clamp: 3; overflow: hidden; }
    .about:not(.open) .people, .about:not(.open) .latest { display: none; }
    .read-more { display: block; justify-self: start; min-height: var(--tap); margin-top: -10px; padding: 0; border: 0; background: none; color: var(--ink); font: 750 13px var(--font); font-stretch: 85%; text-transform: uppercase; letter-spacing: 0.05em; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
    .story { font-size: var(--text-read); }
  }

  .note { margin-top: 8px; font-size: 12.5px; }
  .stack { display: flex; height: 12px; border-radius: 2px; overflow: hidden; background: var(--panel-2); gap: 2px; }
  .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 8px; }
  .small { font-size: 12.5px; }
  .next { line-height: 1.6; }
  .next .sub { display: block; font-size: 12.5px; }
  @media (max-width: 760px) {
    .head { grid-template-columns: 1fr; gap: 10px; }
    .quote { text-align: left; }
    .chg { justify-content: flex-start; flex-wrap: wrap; }
    .about { grid-template-columns: minmax(0, 1fr); }
    .who { gap: 12px; align-items: flex-start; }
    .who :global(.logo) { --s: 40px !important; }
    .ids { gap: 4px 10px; }
    .ids .mono + .mono { display: none; } /* the ISIN stays on the wide layout and in the overview */
    .head h1 { font-size: clamp(28px, 8.5vw, 36px); }
    .px { font-size: 44px; }
  }
</style>
