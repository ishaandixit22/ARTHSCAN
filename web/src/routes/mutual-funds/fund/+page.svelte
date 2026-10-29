<script lang="ts">
  import { BRAND } from "$lib/brand";
  import { cr, fetchedAt, num, pct, tone } from "$lib/format";

  let { data } = $props();
  const f = $derived(data.fund.data);
  const b = $derived(f?.basic_info ?? {});
  const r = $derived(f?.returns ?? {});
  const holdings = $derived((f?.holdings ?? []).slice(0, 20));
  const PERIODS = ["1m", "3m", "6m", "1y", "3y", "5y", "10y"];
  // Up to 1 year the provider gives absolute returns; beyond that, CAGR.
  const ret = (p: string) => (["3y", "5y", "10y"].includes(p) ? r.cagr?.[p] : r.absolute?.[p]);
</script>

<svelte:head><title>{b.fund_name ?? data.name} — {BRAND}</title></svelte:head>

<div class="page">
  <div class="crumbs"><a href="/mutual-funds">Mutual funds</a></div>
  {#if data.fund.error}
    <h1>{data.name}</h1>
    <div class="notice">{data.fund.error}</div>
  {:else}
    <div class="head">
      <div>
        <h1>{b.fund_name ?? data.name}</h1>
        <p class="sub">
          {f.additional_info?.sub_category ?? b.category ?? ""} · {b.plan_type ?? ""} {b.scheme_type ?? ""}
          {#if b.risk_level}<span class="chip">{b.risk_level}</span>{/if}
        </p>
      </div>
      <div class="quote">
        <div class="px">₹{num(f.nav_info?.current_nav, 4)}</div>
        <div class="sub">NAV on {f.nav_info?.nav_date ?? "—"}</div>
      </div>
    </div>

    {#if /\bregular\b/i.test(data.name) && /direct/i.test(b.plan_type ?? "")}
      <div class="notice">Showing the Direct plan. The Regular plan you picked has the same portfolio but a higher expense ratio, so its NAV and returns are lower.</div>
    {/if}
    <div class="grid grid-4">
      <div class="card stat"><div class="label">Fund size (AUM)</div><div class="value">{cr(b.fund_size)}</div></div>
      <div class="card stat"><div class="label">Expense ratio</div><div class="value">{pct(f.expense_ratio?.current, false)}</div></div>
      <div class="card stat"><div class="label">Since inception (CAGR)</div><div class="value {tone(r.cagr?.since_inception)}">{pct(r.cagr?.since_inception)}</div></div>
      <div class="card stat"><div class="label">Minimum SIP · lump sum</div><div class="value small">₹{num(f.investment_info?.minimum_sip, 0)} · ₹{num(f.investment_info?.minimum_lumpsum, 0)}</div></div>
    </div>

    <section class="card">
      <div class="card-head"><h2>Returns</h2><span class="sub">absolute up to 1Y, annualised beyond</span></div>
      <div class="table-scroll">
        <table>
          <thead><tr><th></th>{#each PERIODS as p}<th>{p.toUpperCase()}</th>{/each}</tr></thead>
          <tbody>
            <tr><td>This fund</td>{#each PERIODS as p}<td class={tone(ret(p))}>{pct(ret(p))}</td>{/each}</tr>
            <tr><td>Category average</td>{#each PERIODS as p}<td class={tone(r.category_returns?.[p])}>{pct(r.category_returns?.[p])}</td>{/each}</tr>
          </tbody>
        </table>
      </div>
    </section>

    <div class="grid grid-2">
      <section class="card">
        <div class="card-head"><h2>About</h2></div>
        <table class="kv">
          <tbody>
            <tr><td>Fund house</td><td>{f.fund_house?.name ?? "—"}</td></tr>
            <tr><td>Fund managers</td><td class="wrap-cell">{b.fund_manager ?? "—"}</td></tr>
            <tr><td>Benchmark</td><td class="wrap-cell">{b.benchmark_name ?? b.benchmark ?? "—"}</td></tr>
            <tr><td>Launched</td><td>{b.inception_date ?? "—"}</td></tr>
            <tr><td>ISIN</td><td class="mono">{f.additional_info?.isin ?? "—"}</td></tr>
            <tr><td>Exit load</td><td class="wrap-cell">{f.exit_load?.[0]?.description ?? "—"}</td></tr>
          </tbody>
        </table>
      </section>
      <section class="card">
        <div class="card-head"><h2>Risk</h2></div>
        <table class="kv">
          <tbody>
            <tr><td>Standard deviation</td><td>{num(r.risk_metrics?.standard_deviation)}</td></tr>
            <tr><td>Sharpe ratio</td><td>{num(r.risk_metrics?.sharpe_ratio)}</td></tr>
            <tr><td>Sortino ratio</td><td>{num(r.risk_metrics?.sortino_ratio)}</td></tr>
            <tr><td>Alpha</td><td>{num(r.risk_metrics?.alpha)}</td></tr>
            <tr><td>Beta</td><td>{num(r.risk_metrics?.beta)}</td></tr>
          </tbody>
        </table>
      </section>
    </div>

    {#if holdings.length}
      <section class="card">
        <div class="card-head"><h2>Top holdings</h2><span class="sub">{f.holdings.length} in total</span></div>
        <div class="table-scroll">
          <table>
            <thead><tr><th>Holding</th><th class="left wide-only">Sector</th><th class="wide-only">Value</th><th>% of fund</th></tr></thead>
            <tbody>
              {#each holdings as h, i (i)}
                <tr><td>{h.company_name}</td><td class="left wide-only">{h.sector_name ?? "—"}</td><td class="wide-only">{cr(h.market_value)}</td><td>{pct(h.corpus_percentage, false)}</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}
    <p class="sub source">Fetched {fetchedAt(data.fund.fetched_at)}. Past returns don't predict future returns. Source: Indian Stock API.</p>
  {/if}
</div>

<style>
  .crumbs { color: var(--ink-3); font-size: 13px; margin-bottom: -12px; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
  .head .sub { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 4px; }
  .quote { text-align: right; }
  .px { font-size: 30px; font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
  .value.small { font-size: 16px; }
  .kv td:first-child { color: var(--ink-2); }
  .wrap-cell { white-space: normal; max-width: 340px; }
  .source { font-size: 12.5px; }
  @media (max-width: 640px) { .wide-only { display: none; } .quote { text-align: left; } }
</style>
