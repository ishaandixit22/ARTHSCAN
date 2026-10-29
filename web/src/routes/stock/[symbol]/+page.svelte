<script lang="ts">
  import PriceChart from "$lib/components/PriceChart.svelte";
  import StockTable from "$lib/components/StockTable.svelte";
  import { BRAND } from "$lib/brand";
  import { compact, cr, crore, date, num, pct, price, tone } from "$lib/format";

  let { data } = $props();
  const c = $derived(data.company);
  const m = $derived(c.metrics ?? {});
  let mode = $state<"line" | "candles">("line");

  const range = $derived(m.high_52w && m.low_52w ? (m.close - m.low_52w) / (m.high_52w - m.low_52w) : null);
  // Fundamentals not imported yet: fetch them from the Indian Stock API once the
  // page is in the browser (crawlers don't run this, so they don't spend the plan).
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
  const fromExt = $derived(!data.financials.periods.length && !data.shareholding.quarters.length && !!extFund);
  const fin = $derived([...(data.financials.periods.length ? data.financials.periods : (extFund?.periods ?? []))].reverse());
  const sh = $derived(data.shareholding.quarters.length ? data.shareholding.quarters : (extFund?.quarters ?? []));
  const hasPledge = $derived(sh.some((q: any) => q.pledged_pct != null));
  // Imported results carry tax in crore; the provider gives OPM and tax as percentages.
  const FIN_ROWS = $derived(
    fromExt
      ? [["Revenue", "revenue"], ["Expenses", "expenses"], ["Operating profit", "operating_profit"], ["OPM %", "opm_pct", "pct"], ["Other income", "other_income"], ["Depreciation", "depreciation"], ["Interest", "interest"], ["Profit before tax", "pbt"], ["Tax %", "tax_pct", "pct"], ["Net profit", "net_profit"]]
      : [["Revenue", "revenue"], ["Expenses", "expenses"], ["Operating profit", "operating_profit"], ["Other income", "other_income"], ["Depreciation", "depreciation"], ["Interest", "interest"], ["Profit before tax", "pbt"], ["Tax", "tax"], ["Net profit", "net_profit"]],
  );
  const latestSh = $derived(sh[0]);

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
  <div class="head">
    <div>
      <div class="crumbs">
        {#if c.sector}<a href="/sectors/{encodeURIComponent(c.sector)}">{c.sector}</a> ·{/if}
        NSE: {c.symbol}{c.series && c.series !== "EQ" ? ` · ${c.series}` : ""}
      </div>
      <h1>{c.name}</h1>
    </div>
    <div class="quote">
      <div class="px">{price(m.close)}</div>
      <div class="chg {tone(m.change_pct)}">{pct(m.change_pct)} <span class="sub">· close {date(m.as_of)}</span></div>
    </div>
  </div>

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
          <p class="sub note">
            Prices before {data.history.adjustments.map((a: any) => date(a.ex_date)).join(", ")} are adjusted for a split, bonus or consolidation.
          </p>
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
    {#if m.pe != null}
      <div class="card stat"><div class="label">P/E (TTM)</div><div class="value">{num(m.pe, 1)}</div></div>
    {:else}
      <div class="card stat"><div class="label">Return 1Y</div><div class="value {tone(m.ret_1y)}">{pct(m.ret_1y)}</div></div>
    {/if}
    <div class="card stat"><div class="label">Volume · Avg 20D</div><div class="value small">{compact(m.volume)} · {compact(m.avg_volume_20d)}</div></div>
  </div>

  <div class="grid grid-2">
    <section class="card">
      <div class="card-head"><h2>Returns</h2></div>
      <div class="returns">
        {#each [["1W", m.ret_1w], ["1M", m.ret_1m], ["3M", m.ret_3m], ["6M", m.ret_6m], ["1Y", m.ret_1y]] as [label, v]}
          <div><span class="sub">{label}</span><b class={tone(v)}>{pct(v)}</b></div>
        {/each}
      </div>
      <table class="kv">
        <tbody>
          <tr><td>50-day average</td><td>{price(m.sma_50)} {#if m.sma_50}<span class="chip {tone(m.close - m.sma_50)}">{m.close > m.sma_50 ? "above" : "below"}</span>{/if}</td></tr>
          <tr><td>200-day average</td><td>{price(m.sma_200)} {#if m.sma_200}<span class="chip {tone(m.close - m.sma_200)}">{m.close > m.sma_200 ? "above" : "below"}</span>{/if}</td></tr>
          <tr><td>Volatility (1Y, annualised)</td><td>{pct(m.volatility_1y, false)}</td></tr>
          <tr><td>Turnover (last day)</td><td>{crore(m.turnover)}</td></tr>
        </tbody>
      </table>
    </section>

    <section class="card">
      <div class="card-head"><h2>Profile</h2></div>
      <table class="kv">
        <tbody>
          <tr><td>Symbol</td><td class="mono">{c.symbol}</td></tr>
          <tr><td>ISIN</td><td class="mono">{c.isin ?? "—"}</td></tr>
          <tr><td>Sector</td><td>{c.sector ?? "Unclassified"}</td></tr>
          <tr><td>Listed on NSE</td><td>{date(c.listing_date)}</td></tr>
          <tr><td>Face value</td><td>{c.face_value != null ? `₹${c.face_value}` : "—"}</td></tr>
          <tr><td>Series</td><td>{c.series ?? "—"}</td></tr>
        </tbody>
      </table>
    </section>
  </div>

  <!-- One placeholder instead of two empty sections until fundamentals are loaded. -->
  {#if fin.length || latestSh}
  <section class="card">
    <div class="card-head"><h2>Quarterly results</h2><span class="sub">INR crore · {fromExt ? "source: Indian Stock API" : "consolidated where filed"}</span></div>
    {#if fin.length}
      <div class="table-scroll">
        <table>
          <thead><tr><th>Quarter ending</th>{#each fin as f}<th>{date(f.period_end)}</th>{/each}</tr></thead>
          <tbody>
            {#each FIN_ROWS as [label, key, kind]}
              <tr><td>{label}</td>{#each fin as f}<td>{kind === "pct" ? pct(f[key], false) : num(f[key], 0)}</td>{/each}</tr>
            {/each}
            <tr><td>EPS (₹)</td>{#each fin as f}<td>{num(f.eps)}</td>{/each}</tr>
          </tbody>
        </table>
      </div>
    {:else}
      <div class="empty">Results for {c.symbol} are not loaded yet. Financials come from exchange XBRL filings or a vendor feed — see <code>pipeline/README.md</code>.</div>
    {/if}
  </section>

  <section class="card">
    <div class="card-head"><h2>Shareholding</h2>{#if latestSh}<span class="sub">as of {date(latestSh.quarter_end)}{fromExt ? " · source: Indian Stock API" : ""}</span>{/if}</div>
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
      <div class="empty">Shareholding for {c.symbol} is not loaded yet.</div>
    {/if}
  </section>

  {:else}
    <section class="card card-body soon">
      <h2>Financials & shareholding</h2>
      <p class="sub">
        {#if extLoading}Loading quarterly results and shareholding for {c.symbol}…{:else}Quarterly results and the shareholding pattern for {c.symbol} aren't available right now.{/if}
      </p>
    </section>
  {/if}

  {#if c.peers?.length}
    <section class="card">
      <div class="card-head"><h2>Peers in {c.sector}</h2></div>
      <StockTable rows={c.peers} cols={["close", "change_pct", "ret_1m", "ret_1y", "pe"]} />
    </section>
  {/if}
</div>

<style>
  .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
  .crumbs { color: var(--ink-3); font-size: 13px; margin-bottom: 4px; }
  .quote { text-align: right; }
  .px { font-size: 30px; font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
  .chg { font-weight: 500; }
  .note { margin-top: 8px; font-size: 12.5px; }
  .value.small { font-size: 16px; }
  .range { position: relative; height: 4px; margin-top: 10px; border-radius: 2px; background: linear-gradient(90deg, var(--down-soft), var(--up-soft)); }
  .range span { position: absolute; top: -4px; width: 4px; height: 12px; margin-left: -2px; border-radius: 2px; background: var(--ink); }
  .returns { display: grid; grid-template-columns: repeat(5, 1fr); border-bottom: 1px solid var(--line); }
  .returns div { padding: 12px 16px; display: grid; gap: 2px; }
  .returns b { font-variant-numeric: tabular-nums; font-weight: 600; }
  .kv td:first-child { color: var(--ink-2); }
  .soon { display: grid; gap: 6px; }
  .stack { display: flex; height: 14px; border-radius: 7px; overflow: hidden; background: var(--panel-2); }
  .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 8px; }
  @media (max-width: 640px) { .returns { grid-template-columns: repeat(3, 1fr); } .quote { text-align: left; } }
</style>
