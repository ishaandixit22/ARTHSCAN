<script lang="ts">
  import { page } from "$app/state";
  import { replaceState } from "$app/navigation";
  import PriceChart from "$lib/components/PriceChart.svelte";
  import StatementTable from "$lib/components/StatementTable.svelte";
  import StockTable from "$lib/components/StockTable.svelte";
  import LiveBadge from "$lib/components/LiveBadge.svelte";
  import { BRAND } from "$lib/brand";
  import { compact, crore, date, num, pct, price, tone } from "$lib/format";
  import { live, tradeTime, watch } from "$lib/live.svelte";

  let { data } = $props();
  const c = $derived(data.company);
  const m = $derived(c.metrics ?? {});
  let mode = $state<"line" | "candles">("line");

  // Live price from Dhan when this account has live access; end-of-day close otherwise.
  $effect(() => (data.live ? watch([c.symbol]) : undefined));
  const lq = $derived(data.live ? live.quotes[c.symbol] : undefined);

  // ── Sections: one tab open at a time, kept in the URL (?tab=) without reloading ──
  const TABS = [
    { key: "overview", label: "Overview" },
    { key: "technicals", label: "Technicals" },
    { key: "financials", label: "Financials" },
    { key: "shareholding", label: "Shareholding" },
    { key: "peers", label: "Peers" },
  ] as const;
  type Tab = (typeof TABS)[number]["key"];
  const initialTab = (): Tab => (TABS.find((t) => t.key === page.url.searchParams.get("tab"))?.key ?? "overview");
  let tab = $state<Tab>(initialTab());
  function openTab(t: Tab) {
    tab = t;
    const u = new URL(page.url);
    if (t === "overview") u.searchParams.delete("tab");
    else u.searchParams.set("tab", t);
    replaceState(u, {});
  }

  // ── Quarterly results + shareholding (imported, or from the provider in the browser) ──
  let extFund = $state<{ periods: any[]; quarters: any[]; fetched_at: string | null } | null>(null);
  let extLoading = $state(false);
  $effect(() => {
    const sym = c.symbol;
    extFund = null;
    if (data.financials.periods.length || data.shareholding.quarters.length) return;
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

  // ── Full statements, fetched when the Financials tab first opens ──
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
  $effect(() => {
    if (tab !== "financials") return;
    const key = statementKey;
    if (statements[key] !== undefined) return;
    statements[key] = "loading";
    fetch(`/stock/${encodeURIComponent(c.symbol)}/statements?stats=${key}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d) => (statements[key] = d?.rows?.length ? d : null));
  });
  const current = $derived(statements[statementKey]);
  const spec = $derived(STATEMENTS.find((s) => s.key === statementKey)!);

  // ── Summary: plain facts from the figures on this page ──
  const moved = (v: number) => (v >= 0 ? "rose" : "fell");
  const summary = $derived.by(() => {
    if (m.close == null) return "";
    const parts = [`${c.name} (${c.symbol}) closed at ${price(m.close)} on ${date(m.as_of)}${m.change_pct != null ? `, ${m.change_pct >= 0 ? "up" : "down"} ${Math.abs(m.change_pct).toFixed(2)}% on the day` : ""}.`];
    if (m.ret_1y != null) parts.push(`The share price ${moved(m.ret_1y)} ${Math.abs(m.ret_1y).toFixed(1)}% over the past year (adjusted for splits and bonuses)${m.pct_from_high != null && m.pct_from_high < -0.5 ? ` and sits ${Math.abs(m.pct_from_high).toFixed(1)}% below its 52-week high of ${price(m.high_52w)}` : m.pct_from_high != null ? " and trades at its 52-week high" : ""}.`);
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

  const range = $derived(m.high_52w && m.low_52w ? (m.close - m.low_52w) / (m.high_52w - m.low_52w) : null);
  const monogram = $derived(c.symbol.replace(/[^A-Z]/g, "").slice(0, 2) || c.symbol.slice(0, 2));
  const SH_PARTS = [
    { key: "promoter", label: "Promoters", color: "var(--brand)" },
    { key: "fii", label: "FII / FPI", color: "#3b82c4" },
    { key: "dii", label: "DII", color: "#d08a2c" },
    { key: "government", label: "Government", color: "#8a6cc4" },
    { key: "public", label: "Public", color: "var(--line-2)" },
    { key: "others", label: "Others", color: "var(--ink-3)" },
  ];
</script>

<svelte:head><title>{c.symbol} · {c.name} — {BRAND}</title></svelte:head>

<div class="page">
  <!-- Identity and price -->
  <header class="head">
    <div class="who">
      <div class="mono-mark" aria-hidden="true">{monogram}</div>
      <div>
        <h1>{c.name}</h1>
        <p class="ids">
          <span class="mono">NSE: {c.symbol}</span>
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
        <div class="px">{price(m.close)}</div>
        <div class="chg {tone(m.change_pct)}">{pct(m.change_pct)} <span class="sub">· close {date(m.as_of)}</span>{#if data.live} <LiveBadge />{/if}</div>
      {/if}
    </div>
    <dl class="keys">
      {#if m.pe != null}<div><dt>P/E (TTM)</dt><dd>{num(m.pe, 1)}</dd></div>{/if}
      <div><dt>52W high</dt><dd>{price(m.high_52w)}</dd></div>
      <div><dt>52W low</dt><dd>{price(m.low_52w)}</dd></div>
      <div><dt>1Y return</dt><dd class={tone(m.ret_1y)}>{pct(m.ret_1y)}</dd></div>
      <div><dt>Turnover</dt><dd>{crore(m.turnover)}</dd></div>
    </dl>
  </header>

  {#if summary}
    <p class="summary">{summary}{#if extLoading}<span class="sub"> Loading quarterly figures…</span>{/if}</p>
  {/if}

  <!-- Section tabs -->
  <nav class="sections" aria-label="Stock sections">
    <div class="tabs" role="tablist">
      {#each TABS as t}
        <button role="tab" aria-selected={tab === t.key} class:active={tab === t.key} onclick={() => openTab(t.key)}>{t.label}</button>
      {/each}
    </div>
  </nav>

  {#if tab === "overview"}
    <section class="card">
      <div class="card-head">
        <div class="tabs">
          {#each data.periods as p}
            <a href="?period={p}" class:active={p === data.period} data-sveltekit-noscroll>{p.toUpperCase()}</a>
          {/each}
        </div>
        <div class="tabs">
          <button class:active={mode === "line"} onclick={() => (mode = "line")}>Line</button>
          <button class:active={mode === "candles"} onclick={() => (mode = "candles")}>Candles</button>
        </div>
      </div>
      <div class="card-body">
        {#if data.history?.candles.length}
          <PriceChart candles={data.history.candles} {mode} />
          {#if data.history.adjustments?.length}
            <p class="sub note">Prices before {data.history.adjustments.map((a: any) => date(a.ex_date)).join(", ")} are adjusted for a split, bonus or consolidation.</p>
          {/if}
        {:else}
          <div class="empty">No price history yet.</div>
        {/if}
      </div>
    </section>

    <div class="grid grid-4">
      <div class="card stat"><div class="label">52-week range</div>
        <div class="value small">{price(m.low_52w)} – {price(m.high_52w)}</div>
        {#if range !== null}<div class="range" aria-hidden="true"><span style="left: {Math.min(100, Math.max(0, range * 100))}%"></span></div>{/if}
      </div>
      <div class="card stat"><div class="label">From 52W high</div><div class="value {tone(m.pct_from_high)}">{pct(m.pct_from_high)}</div></div>
      <div class="card stat"><div class="label">Volume · 20-day avg</div><div class="value small">{compact(m.volume)} · {compact(m.avg_volume_20d)}</div></div>
      <div class="card stat"><div class="label">Delivery · 20-day avg</div><div class="value small">{pct(m.deliv_pct, false)} · {pct(m.deliv_pct_avg_20, false)}</div></div>
    </div>

    <section class="card">
      <div class="card-head"><h2>Profile</h2></div>
      <dl class="profile">
        <div><dt>Symbol</dt><dd class="mono">{c.symbol}</dd></div>
        <div><dt>ISIN</dt><dd class="mono">{c.isin ?? "—"}</dd></div>
        <div><dt>Sector</dt><dd>{c.sector ?? "Unclassified"}</dd></div>
        <div><dt>Listed on NSE</dt><dd>{date(c.listing_date)}</dd></div>
        <div><dt>Face value</dt><dd>{c.face_value != null ? `₹${c.face_value}` : "—"}</dd></div>
        <div><dt>Series</dt><dd>{c.series ?? "—"}</dd></div>
      </dl>
    </section>
  {:else if tab === "technicals"}
    <section class="card">
      <div class="card-head"><h2>Returns</h2><span class="sub">adjusted for splits and bonuses</span></div>
      <div class="returns">
        {#each [["1 week", m.ret_1w], ["1 month", m.ret_1m], ["3 months", m.ret_3m], ["6 months", m.ret_6m], ["1 year", m.ret_1y]] as [label, v]}
          <div><span class="sub">{label}</span><b class={tone(v)}>{pct(v)}</b></div>
        {/each}
      </div>
    </section>
    <section class="card">
      <div class="card-head"><h2>Indicators</h2><span class="sub">as of the close of {date(m.as_of)}</span></div>
      <table class="kv">
        <tbody>
          <tr><td>50-day average</td><td>{price(m.sma_50)} {#if m.sma_50}<span class="chip {tone(m.close - m.sma_50)}">{m.close > m.sma_50 ? "above" : "below"}</span>{/if}</td></tr>
          <tr><td>200-day average</td><td>{price(m.sma_200)} {#if m.sma_200}<span class="chip {tone(m.close - m.sma_200)}">{m.close > m.sma_200 ? "above" : "below"}</span>{/if}</td></tr>
          <tr><td>RSI (14)</td><td>{num(m.rsi_14, 1)} {#if m.rsi_14 != null && (m.rsi_14 < 30 || m.rsi_14 > 70)}<span class="chip {m.rsi_14 < 30 ? 'down' : 'up'}">{m.rsi_14 < 30 ? "oversold" : "overbought"}</span>{/if}</td></tr>
          <tr><td>MACD histogram (12, 26, 9)</td><td class={tone(m.macd_hist)}>{num(m.macd_hist)}</td></tr>
          <tr><td>Volatility (1 year, annualised)</td><td>{pct(m.volatility_1y, false)}</td></tr>
          <tr><td>Volume vs 20-day average</td><td>{m.vol_ratio != null ? `${num(m.vol_ratio, 1)}x` : "—"}</td></tr>
          <tr><td>Signals</td><td>
            {#if m.cross_signal}<span class="chip {m.cross_signal === 'golden' ? 'up' : 'down'}">{m.cross_signal} cross · {date(m.cross_date)}</span>{/if}
            {#if m.breakout}<span class="chip {m.breakout === 'high' ? 'up' : 'down'}">52W {m.breakout === "high" ? "breakout" : "breakdown"}</span>{/if}
            {#if (m.vol_ratio ?? 0) >= 3}<span class="chip">volume spike</span>{/if}
            {#if !m.cross_signal && !m.breakout && (m.vol_ratio ?? 0) < 3}<span class="sub">None today</span>{/if}
          </td></tr>
        </tbody>
      </table>
    </section>
  {:else if tab === "financials"}
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
        <div class="empty">Loading the {spec.label.toLowerCase()} for {c.symbol}…</div>
      {:else if current}
        <StatementTable periods={current.periods} rows={current.rows} growthFor={[...spec.growth]} lag={spec.lag} />
      {:else}
        <div class="empty">The {spec.label.toLowerCase()} for {c.symbol} isn't available right now.</div>
      {/if}
    </section>
    <p class="sub small">Source: Indian Stock API, from company filings. Annual columns are financial years; TTM is the trailing twelve months.</p>
  {:else if tab === "shareholding"}
    <section class="card">
      <div class="card-head"><h2>Shareholding pattern</h2>{#if latestSh}<span class="sub">as of {date(latestSh.quarter_end)}</span>{/if}</div>
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
        <div class="empty">{extLoading ? `Loading shareholding for ${c.symbol}…` : `Shareholding for ${c.symbol} isn't available right now.`}</div>
      {/if}
    </section>
  {:else if tab === "peers"}
    <section class="card">
      <div class="card-head"><h2>Peers in {c.sector ?? "this sector"}</h2></div>
      {#if c.peers?.length}
        <StockTable rows={c.peers} cols={["close", "change_pct", "ret_1m", "ret_1y", "pe"]} />
      {:else}
        <div class="empty">No sector peers for {c.symbol}.</div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .head { display: grid; grid-template-columns: 1fr auto; gap: 18px 24px; align-items: start; }
  .who { display: flex; gap: 16px; align-items: center; min-width: 0; }
  .mono-mark {
    width: 52px; height: 52px; flex-shrink: 0; display: grid; place-items: center; border-radius: 12px;
    background: var(--panel); border: 1px solid var(--line); color: var(--mark); font: 700 18px var(--font); letter-spacing: -0.02em;
  }
  .ids { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; margin-top: 6px; color: var(--ink-3); font-size: 12.5px; }
  .ids .chip { color: var(--brand-2); background: var(--brand-soft); }
  .quote { text-align: right; }
  .px { font: 600 32px/1.1 var(--mono); letter-spacing: -0.03em; }
  .chg { font: 500 14px var(--mono); display: flex; gap: 8px; align-items: center; justify-content: flex-end; margin-top: 4px; }
  .chg .sub { font-family: var(--font); }
  .dayline { font-size: 12px; margin-top: 4px; font-family: var(--mono); }
  .keys { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 10px 36px; margin: 0; padding-top: 16px; border-top: 1px solid var(--line); }
  .keys dt { font-size: 12px; color: var(--ink-3); }
  .keys dd { margin: 2px 0 0; font: 500 15px var(--mono); }
  .summary { font-size: 15px; line-height: 1.65; color: var(--ink-2); max-width: 980px; }

  .sections { position: sticky; top: 56px; z-index: 5; background: var(--bg); border-bottom: 1px solid var(--line); }
  .sections .tabs { gap: 28px; }
  .sections button { padding: 13px 0; font-size: 14px; }
  @media (max-width: 640px) {
    .sections { overflow-x: auto; scrollbar-width: none; }
    .sections .tabs { gap: 22px; }
    .sections button { white-space: nowrap; }
  }

  .note { margin-top: 8px; font-size: 12.5px; }
  .value.small { font-size: 16px; }
  .range { position: relative; height: 3px; margin-top: 12px; border-radius: 2px; background: color-mix(in srgb, var(--ink-3) 30%, transparent); }
  .range span { position: absolute; top: -4px; width: 3px; height: 11px; margin-left: -1px; border-radius: 2px; background: var(--ink); }
  .profile { display: grid; grid-template-columns: repeat(3, 1fr); margin: 0; }
  .profile div { padding: 14px 18px; border-bottom: 1px solid var(--line); }
  .profile dt { font-size: 12px; color: var(--ink-3); }
  .profile dd { margin: 3px 0 0; font-size: 14px; }
  .returns { display: grid; grid-template-columns: repeat(5, 1fr); }
  .returns div { padding: 16px 18px; display: grid; gap: 4px; }
  .returns b { font: 500 18px var(--mono); }
  .kv td:first-child { color: var(--ink-2); }
  .kv td:last-child { display: flex; gap: 8px; align-items: center; justify-content: flex-end; height: 42px; }
  .stack { display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: var(--panel-2); gap: 2px; }
  .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 8px; }
  .small { font-size: 12.5px; }
  @media (max-width: 760px) {
    .head { grid-template-columns: 1fr; }
    .quote { text-align: left; }
    .chg { justify-content: flex-start; }
    .profile { grid-template-columns: repeat(2, 1fr); }
    .returns { grid-template-columns: repeat(3, 1fr); }
    .keys { gap: 10px 24px; }
  }
</style>
