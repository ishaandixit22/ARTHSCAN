<script lang="ts">
  import { BRAND } from "$lib/brand";
  import IndexChart from "$lib/components/IndexChart.svelte";
  import StockTable from "$lib/components/StockTable.svelte";
  import LiveStamp from "$lib/components/LiveStamp.svelte";
  import { INDICES } from "$lib/indices";
  import { date, num, pct, tone } from "$lib/format";
  import { market, useLiveMarket } from "$lib/liveMarket.svelte";

  let { data } = $props();
  const info = $derived(data.info);
  const days = $derived(data.days);
  const isVix = $derived(info.name === "India VIX");

  // Live level while the market is open (accounts with live access), else the last NSE close.
  $effect(() => (data.live ? useLiveMarket() : undefined));
  const liveQ = $derived(data.live ? market.data?.indices.find((x) => x.index_name === info.name) ?? null : null);
  const lastDay = $derived(days[days.length - 1] ?? null);
  const prevDay = $derived(days[days.length - 2] ?? null);
  const level = $derived(liveQ?.ltp ?? lastDay?.close ?? null);
  const prevClose = $derived(liveQ ? liveQ.prev_close : (prevDay?.close ?? null));
  const changePct = $derived(liveQ ? liveQ.change_pct : (lastDay?.change_pct ?? null));
  const changeAbs = $derived(level != null && prevClose != null ? level - prevClose : null);

  // ── Chart ranges ──────────────────────────────────────────────
  type Range = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "3Y" | "5Y" | "Max";
  const SPAN: Record<Exclude<Range, "1D" | "Max">, number> = { "1W": 7, "1M": 31, "3M": 92, "6M": 183, "1Y": 366, "3Y": 3 * 366, "5Y": 5 * 366 };
  const spanDays = $derived(days.length ? (Date.parse(lastDay!.date) - Date.parse(days[0].date)) / 86400_000 : 0);
  type Intraday = { session: string; prevClose: number | null; candles: { time: number; open: number; high: number; low: number; close: number }[] };
  let intraday = $state<Intraday | null>(null);
  let intradayState = $state<"loading" | "ok" | "none">("loading");
  let range = $state<Range>("1D");
  // Longer ranges only once the stored history reaches back that far.
  const ranges = $derived((["1D", "1W", "1M", "3M", "6M", "1Y", "3Y", "5Y", "Max"] as Range[]).filter((r) =>
    r === "1D" ? intradayState !== "none" : r === "Max" ? true : SPAN[r] <= spanDays + 30 || r === "1W" || r === "1M"));

  $effect(() => {
    const slug = info.slug;
    intraday = null;
    intradayState = "loading";
    range = "1D";
    fetch(`/indices/${slug}/chart`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((r) => {
        if (slug !== info.slug) return;
        if (r?.candles?.length) { intraday = r; intradayState = "ok"; }
        else { intradayState = "none"; if (range === "1D") range = "1M"; }
      });
  });

  const view = $derived.by(() => {
    if (range === "1D") {
      const c = intraday?.candles ?? [];
      if (!c.length) return null;
      const base = intraday?.prevClose ?? c[0].open;
      return {
        points: c.map((x) => ({ time: x.time, value: x.close })), base, intraday: true,
        high: Math.max(...c.map((x) => x.high)), low: Math.min(...c.map((x) => x.low)),
        ret: base ? ((c[c.length - 1].close - base) / base) * 100 : null,
      };
    }
    if (!days.length) return null;
    const from = range === "Max" ? 0 : Date.parse(lastDay!.date) - SPAN[range] * 86400_000;
    const start = range === "Max" ? 0 : Math.max(0, days.findIndex((d) => Date.parse(d.date) >= from));
    const slice = days.slice(start);
    // Return over the range: from the close before it began to the latest level.
    const base = (start > 0 ? days[start - 1].close : slice[0].close) as number;
    const lastValue = level ?? (slice[slice.length - 1].close as number);
    return {
      points: slice.map((d) => ({ date: d.date, value: d.close as number })), base, intraday: false,
      high: Math.max(...slice.map((d) => d.high ?? (d.close as number))), low: Math.min(...slice.map((d) => d.low ?? (d.close as number))),
      ret: base ? ((lastValue - base) / base) * 100 : null,
    };
  });

  // ── Key numbers ───────────────────────────────────────────────
  const yearAgo = $derived(lastDay ? Date.parse(lastDay.date) - 365 * 86400_000 : 0);
  const year = $derived(days.filter((d) => Date.parse(d.date) >= yearAgo));
  const high52 = $derived(year.length ? Math.max(...year.map((d) => d.high ?? (d.close as number))) : null);
  const low52 = $derived(year.length ? Math.min(...year.map((d) => d.low ?? (d.close as number))) : null);
  function ret(spanDays: number) {
    if (!lastDay || level == null) return null;
    const t = Date.parse(lastDay.date) - spanDays * 86400_000;
    // The stored history may start a few days short of the span; within a week still counts.
    const past = [...days].reverse().find((d) => Date.parse(d.date) <= t) ?? (days[0] && Date.parse(days[0].date) - t <= 7 * 86400_000 ? days[0] : undefined);
    return past?.close ? ((level - past.close) / past.close) * 100 : null;
  }
  const returns = $derived([["1 week", 7], ["1 month", 31], ["3 months", 92], ["6 months", 183], ["1 year", 365], ["3 years", 3 * 365]]
    .map(([label, n]) => ({ label: label as string, value: ret(n as number) })).filter((r) => r.value != null));
  const pe = $derived(data.peRange);

  // ── Tabs ──────────────────────────────────────────────────────
  type Tab = "overview" | "constituents" | "etfs";
  let tab = $state<Tab>("overview");
  $effect(() => { void info.slug; tab = "overview"; });
  const tabs = $derived([
    { id: "overview" as Tab, label: "Overview" },
    ...(data.constituents.length ? [{ id: "constituents" as Tab, label: "Constituents" }] : []),
    ...(data.etfs.length ? [{ id: "etfs" as Tab, label: "ETFs" }] : []),
  ]);
  const adv = $derived(data.constituents.filter((s) => (s.change_pct ?? 0) > 0).length);
  const dec = $derived(data.constituents.filter((s) => (s.change_pct ?? 0) < 0).length);

  const fmt = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 }));
  const signed = (v: number | null) => (v == null ? "" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmt(Math.abs(v))}`);
  const arrow = (v: number | null | undefined) => (v == null || v === 0 ? "" : v > 0 ? "▲" : "▼");
</script>

<svelte:head>
  <title>{info.label} today: level, chart{data.constituents.length ? " and constituents" : " and returns"} — {BRAND}</title>
  <meta name="description" content="{info.label} {level != null ? `at ${fmt(level)}` : ''}: intraday and historical chart, returns, 52-week range{data.constituents.length ? ', constituents' : ''}{data.etfs.length ? ' and ETFs that track it' : ''}." />
</svelte:head>

<div class="page ix">
  <nav class="others" aria-label="Other indices">
    {#each INDICES as o (o.slug)}
      <a href="/indices/{o.slug}" class:on={o.slug === info.slug} aria-current={o.slug === info.slug ? "page" : undefined}>{o.label}</a>
    {/each}
  </nav>

  <div class="grid">
    <aside class="card side">
      <div class="who">
        <span class="mark" aria-hidden="true">{info.label.replace(/^Nifty\s*/i, "").charAt(0) || "N"}</span>
        <div>
          <h1>{info.label}</h1>
          <p class="sym">{info.name.toUpperCase()}</p>
        </div>
      </div>
      <p class="level">
        <b>{fmt(level)}</b>
        <span class={tone(changePct)}>{arrow(changePct)} {pct(changePct, false).replace("-", "")} {#if changeAbs != null}({signed(changeAbs)}){/if}</span>
      </p>
      <p class="stamp">{#if liveQ}<LiveStamp close="" />{:else if lastDay}NSE close · {date(lastDay.date)}{/if}</p>

      {#if data.etfs.length}
        <div class="etfs">
          <h2><span>ETFs tracking this index</span></h2>
          {#each data.etfs.slice(0, 3) as e (e.symbol)}
            <a class="etf" href="/stock/{e.symbol}">
              <span class="ename">{e.name}</span>
              <span class="esym">{e.symbol} <span class={tone(e.change_pct)}>({arrow(e.change_pct)}{pct(e.change_pct, false).replace("-", "")})</span></span>
            </a>
          {/each}
          {#if data.etfs.length > 3}
            <button class="more" onclick={() => (tab = "etfs")}>See all {data.etfs.length} ETFs</button>
          {/if}
        </div>
      {:else}
        <div class="etfs">
          <h2><span>About</span></h2>
          <p class="about">{info.about}</p>
        </div>
      {/if}
    </aside>

    <section class="main">
      <div class="ixtabs" role="tablist">
        {#each tabs as t (t.id)}
          <button role="tab" aria-selected={tab === t.id} class:on={tab === t.id} onclick={() => (tab = t.id)}>{t.label}</button>
        {/each}
      </div>

      {#if tab === "overview"}
        <div class="hl">
          <div><span>High</span><b>{fmt(view?.high)}</b></div>
          <div><span>Low</span><b>{fmt(view?.low)}</b></div>
          <div><span>Returns</span><b class={tone(view?.ret)}>{arrow(view?.ret)} {pct(view?.ret ?? null, false).replace("-", "")}</b></div>
          <a class="adv" href={isVix ? "/valuations" : "/heatmap"}>{isVix ? "All index levels" : "Heatmap"} ›</a>
        </div>

        {#if view && view.points.length > 1}
          {#key range + info.slug}
            <IndexChart points={view.points} base={view.base} showBase={view.intraday} />
          {/key}
          {#if view.intraday && intraday}<p class="note">Minute by minute, {date(intraday.session)}. Times in IST.</p>{/if}
        {:else if range === "1D" && intradayState === "loading"}
          <div class="empty">Loading today's chart…</div>
        {:else}
          <div class="empty">No chart data for this range yet.</div>
        {/if}

        <div class="ranges" role="group" aria-label="Chart range">
          {#each ranges as r (r)}
            <button class:on={range === r} aria-pressed={range === r} onclick={() => (range = r)}>{r}</button>
          {/each}
        </div>

        <h2 class="sec">Key numbers</h2>
        <dl class="kv">
          <div><dt>Previous close</dt><dd>{fmt(prevClose)}</dd></div>
          <div><dt>Open</dt><dd>{fmt(liveQ ? intraday?.candles[0]?.open : lastDay?.open)}</dd></div>
          <div><dt>52-week high</dt><dd>{fmt(high52)}</dd></div>
          <div><dt>52-week low</dt><dd>{fmt(low52)}</dd></div>
          {#if lastDay?.pe != null}<div><dt>P/E</dt><dd>{num(lastDay.pe)}</dd></div>{/if}
          {#if lastDay?.pb != null}<div><dt>P/B</dt><dd>{num(lastDay.pb)}</dd></div>{/if}
          {#if lastDay?.div_yield != null}<div><dt>Dividend yield</dt><dd>{num(lastDay.div_yield)}%</dd></div>{/if}
          {#if pe?.current_percentile != null}<div><dt>P/E vs its own history</dt><dd>{pe.current_percentile <= 1 ? "At its lowest" : pe.current_percentile >= 99 ? "At its highest" : `Above ${pe.current_percentile}% of days`}</dd></div>{/if}
        </dl>

        {#if returns.length}
          <h2 class="sec">Returns</h2>
          <div class="rets">
            {#each returns as r (r.label)}
              <div><span>{r.label}</span><b class={tone(r.value)}>{pct(r.value)}</b></div>
            {/each}
          </div>
        {/if}

        {#if data.etfs.length}
          <h2 class="sec">About {info.label}</h2>
          <p class="about">{info.about}</p>
        {/if}
        <p class="note">Levels and valuations from NSE's daily index report{data.live ? "; live levels and today's chart from Dhan" : ""}.{#if pe} <a href="/valuations?index={encodeURIComponent(info.name)}">P/E history ›</a>{/if}</p>
      {:else if tab === "constituents"}
        <p class="sub cons-head">{data.constituents.length} stocks · <span class="up">{adv} up</span> · <span class="down">{dec} down</span> · close of {date(data.constituentsAsOf)}, most traded first</p>
        <StockTable rows={data.constituents} cols={["close", "change_pct", "turnover", "sector"]} logos />
      {:else if tab === "etfs"}
        <p class="sub cons-head">ETFs listed on NSE that track the {info.label}, most traded first.</p>
        <StockTable rows={data.etfs} cols={["close", "change_pct", "turnover"]} />
      {/if}
    </section>
  </div>
</div>

<style>
  .ix { max-width: 1240px; }
  .others { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 4px 0 18px; }
  .others a { flex: none; padding: 6px 12px; border: 1px solid var(--line); border-radius: 999px; font-size: 13px; font-weight: 600; color: var(--ink-2); white-space: nowrap; }
  .others a:hover { border-color: var(--line-2); color: var(--ink); }
  .others a.on { background: var(--ink); border-color: var(--ink); color: var(--bg); }

  .grid { display: grid; grid-template-columns: minmax(0, 330px) minmax(0, 1fr); gap: 40px; align-items: start; }

  .side { padding: 22px 0 18px; border: 1px solid var(--line); border-radius: 8px; position: sticky; top: 76px; }
  .who { display: flex; gap: 14px; align-items: center; padding: 0 22px; }
  .mark { width: 46px; height: 46px; flex: none; display: grid; place-items: center; border-radius: 50%; background: var(--up-soft); color: var(--up); font-weight: 800; font-size: 17px; }
  h1 { font-size: 22px; line-height: 1.15; margin: 0; letter-spacing: -0.01em; }
  .sym { margin: 3px 0 0; font-size: 12px; letter-spacing: 0.14em; color: var(--ink-3); font-weight: 600; }
  .level { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; margin: 18px 0 0; padding: 0 22px; }
  .level b { font-size: 30px; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
  .level span { font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .stamp { margin: 6px 0 0; padding: 0 22px; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-3); }

  .etfs { margin-top: 18px; }
  .etfs h2 { display: flex; align-items: center; gap: 10px; margin: 0 0 4px; font-size: 14px; font-weight: 600; color: var(--ink-2); }
  .etfs h2::before { content: ""; width: 12px; border-top: 1px solid var(--line); }
  .etfs h2::after { content: ""; flex: 1; border-top: 1px solid var(--line); }
  .etf { display: block; margin: 0 22px; padding: 13px 0; border-bottom: 1px solid var(--line); color: var(--ink); }
  .etf:hover .ename { text-decoration: underline; text-underline-offset: 3px; }
  .ename { display: block; font-weight: 600; font-size: 15px; }
  .esym { display: block; margin-top: 4px; font-size: 12.5px; letter-spacing: 0.1em; color: var(--ink-3); font-weight: 600; }
  .esym span { letter-spacing: 0; }
  .more { margin: 14px 22px 0; padding: 0; background: none; border: 0; font: inherit; font-weight: 700; font-size: 14px; color: var(--ink); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  .about { margin: 8px 22px 0; font-family: var(--serif); font-size: 15px; line-height: 1.55; color: var(--ink-2); }
  .main .about { margin: 0; max-width: 68ch; }

  .ixtabs { display: flex; gap: 28px; border-bottom: 1px solid var(--line); overflow-x: auto; scrollbar-width: none; }
  .ixtabs button { flex: none; background: none; border: 0; padding: 10px 0 12px; font: inherit; font-size: 16px; color: var(--ink-2); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .ixtabs button.on { color: var(--ink); font-weight: 700; border-bottom-color: var(--ink); }

  .hl { display: flex; align-items: flex-end; gap: 32px; margin: 22px 0 8px; flex-wrap: wrap; }
  .hl div { display: grid; gap: 4px; }
  .hl span { font-size: 14px; color: var(--ink-3); }
  .hl b { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .adv { margin-left: auto; padding: 8px 14px; border: 1px solid var(--line-2); border-radius: 8px; font-weight: 600; font-size: 14px; color: var(--ink); }
  .adv:hover { border-color: var(--ink); }

  .empty { height: 360px; display: grid; place-items: center; color: var(--ink-3); border: 1px dashed var(--line); border-radius: 8px; }

  .ranges { display: flex; margin-top: 10px; padding: 4px; background: var(--line); border-radius: 10px; overflow-x: auto; scrollbar-width: none; }
  .ranges button { flex: 1 0 auto; min-width: 44px; padding: 9px 10px; background: none; border: 0; border-radius: 7px; font: inherit; font-weight: 600; font-size: 14px; color: var(--ink-2); cursor: pointer; }
  .ranges button.on { background: var(--bg); color: var(--ink); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08); }

  .sec { margin: 32px 0 10px; font-size: 17px; }
  .kv { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; margin: 0; border-top: 1px solid var(--line); }
  .kv div { padding: 12px 12px 12px 0; border-bottom: 1px solid var(--line); }
  .kv dt { font-size: 13px; color: var(--ink-3); }
  .kv dd { margin: 4px 0 0; font-weight: 700; font-size: 16px; font-variant-numeric: tabular-nums; }
  .rets { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .rets div { display: grid; gap: 4px; padding: 12px 12px 12px 0; }
  .rets span { font-size: 13px; color: var(--ink-3); }
  .rets b { font-variant-numeric: tabular-nums; }
  .note { margin-top: 14px; font-size: 12.5px; color: var(--ink-3); }
  .cons-head { margin: 16px 0 10px; }

  @media (max-width: 960px) {
    .grid { grid-template-columns: minmax(0, 1fr); gap: 24px; }
    .side { position: static; }
    .kv { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .rets { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  @media (max-width: 640px) {
    .hl { gap: 18px; }
    .hl b { font-size: 17px; }
    .adv { display: none; }
    .ixtabs { gap: 20px; }
    .empty { height: 260px; }
  }
</style>
