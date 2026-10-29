<script lang="ts">
  import { goto } from "$app/navigation";
  import { BRAND } from "$lib/brand";
  import ResultsCalendar from "$lib/components/ResultsCalendar.svelte";
  import Sparkline from "$lib/components/Sparkline.svelte";
  import { num } from "$lib/format";

  let { data } = $props();
  const s = $derived(data.season);
  const sum = $derived(s?.summary);
  type Row = {
    symbol: string; name: string; sector: string; revenue: number | null; sales_yoy: number | null; sales_qoq: number | null;
    net_profit: number | null; profit_yoy: number | null; profit_qoq: number | null; eps: number | null; opm: number | null; opm_change: number | null;
    verdict: string; trend: { quarter: string; net_profit: number | null }[];
  };
  const rows = $derived((s?.companies ?? []) as Row[]);

  const href = (p: Record<string, string | number | null>) => {
    const q = new URLSearchParams(data.search);
    for (const [k, v] of Object.entries(p)) (v === null || v === "" ? q.delete(k) : q.set(k, String(v)));
    if (!("n" in p)) q.delete("n");
    const out = q.toString();
    return out ? `?${out}` : "?";
  };
  const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const signed = (v: number | null | undefined) => (v == null ? "n/a" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);
  // Growth cells are tinted by size, so strong and weak quarters stand out down the column.
  const tint = (v: number | null) => (v == null ? "" : `background: color-mix(in srgb, var(${v >= 0 ? "--up" : "--down"}) ${Math.round(6 + Math.min(1, Math.abs(v) / 60) * 22)}%, transparent)`);
  const crore = (v: number | null) => (v == null ? "—" : num(v, 0));
  const qShort = (end: string) => {
    const m = Number(end.slice(5, 7)), y = Number(end.slice(0, 4));
    return `Q${m === 6 ? 1 : m === 9 ? 2 : m === 12 ? 3 : 4} FY${String((m === 3 ? y : y + 1) % 100).padStart(2, "0")}`;
  };

  const SORTS = [["largest", "Largest"], ["profit_growth", "Fastest profit growth"], ["sales_growth", "Fastest sales growth"], ["profit_fall", "Biggest profit falls"]];
  const RESULTS = ["Growing", "Mixed", "Shrinking", "Loss", "Back to profit"];
  const VERDICT_TONE: Record<string, string> = { Growing: "up", "Back to profit": "up", Shrinking: "down", Loss: "down", Mixed: "" };

  // Leaderboard: meaningful bases only (₹100 Cr+ revenue; for profit growth, ₹10 Cr+ profit a year ago),
  // so a jump from almost nothing doesn't top the list.
  const sizable = $derived(rows.filter((r) => (r.revenue ?? 0) >= 100));
  const yearAgoProfit = (r: Row) => (r.net_profit != null && r.profit_yoy != null ? r.net_profit / (1 + r.profit_yoy / 100) : null);
  const profitBase = $derived(sizable.filter((r) => (yearAgoProfit(r) ?? 0) >= 10));
  const boards = $derived([
    { title: "Biggest profit growth", rows: [...profitBase].filter((r) => r.profit_yoy != null).sort((a, b) => b.profit_yoy! - a.profit_yoy!).slice(0, 10), value: (r: Row) => signed(r.profit_yoy) },
    { title: "Biggest profit falls", rows: [...profitBase].filter((r) => r.profit_yoy != null).sort((a, b) => a.profit_yoy! - b.profit_yoy!).slice(0, 10), value: (r: Row) => signed(r.profit_yoy) },
    { title: "Fastest sales growth", rows: [...sizable].filter((r) => r.sales_yoy != null).sort((a, b) => b.sales_yoy! - a.sales_yoy!).slice(0, 10), value: (r: Row) => signed(r.sales_yoy) },
    { title: "Back to profit", rows: rows.filter((r) => r.verdict === "Back to profit").sort((a, b) => (b.net_profit ?? 0) - (a.net_profit ?? 0)).slice(0, 10), value: (r: Row) => `₹${crore(r.net_profit)} Cr` },
  ]);
  const sectorNames = $derived(((s?.sectors ?? []) as { sector: string }[]).map((x) => x.sector).sort());
</script>

<svelte:head><title>{s?.quarter ? `${s.quarter.short} earnings results` : "Earnings tracker"} — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>{s?.quarter ? `${s.quarter.short} earnings results` : "Earnings tracker"}</h1>
      <p class="sub">{#if s?.quarter}{s.quarter.span} quarter · revenue and profit against the same quarter last year (YoY) and the quarter before (QoQ). INR crore, consolidated where filed.{:else}Quarterly results as companies report them.{/if}</p>
    </div>
    {#if s?.quarters?.length > 1}
      <nav class="tabs" aria-label="Quarter">
        {#each [...s.quarters].reverse() as qq}
          <a href={href({ quarter: qq.end === s.quarters[0].end ? null : qq.end })} class:active={qq.end === s.quarter.end} data-sveltekit-noscroll>{qq.short}</a>
        {/each}
      </nav>
    {/if}
  </div>

  {#if !s || !sum}
    <div class="notice">Results for this season aren't loaded yet. They load with <code>npm run data:results</code>; see <code>pipeline/README.md</code>.</div>
  {:else}
    <!-- The season in one line, then the numbers behind it -->
    <p class="lede">
      <b>{sum.declared}</b> companies have reported {s.quarter.span}{#if sum.pending}{" "}and {sum.pending} more have a results date ahead{/if}.
      {#if sum.comparable}<b>{pctOf(sum.grew, sum.comparable)}%</b> grew profit from a year ago; the typical company's sales grew <b>{signed(sum.median_sales_yoy)}</b> and profit <b>{signed(sum.median_profit_yoy)}</b>.{/if}
      {#if sum.strongest}{" "}Strongest sector: <b>{sum.strongest.sector}</b> ({signed(sum.strongest.median_profit_yoy)}){#if sum.weakest}; weakest: <b>{sum.weakest.sector}</b> ({signed(sum.weakest.median_profit_yoy)}){/if}.{/if}
    </p>

    <div class="kpis">
      <div class="card stat">
        <div class="label">Declared</div>
        <div class="value">{sum.declared}{#if sum.pending}<span class="of"> / {sum.declared + sum.pending}</span>{/if}</div>
        {#if sum.pending}<div class="bar"><span class="fill" style="width: {pctOf(sum.declared, sum.declared + sum.pending)}%"></span></div><div class="sub">{pctOf(sum.declared, sum.declared + sum.pending)}% of scheduled reporters</div>{/if}
      </div>
      <div class="card stat">
        <div class="label">Profit breadth</div>
        <div class="value"><span class="up">{pctOf(sum.grew, sum.comparable)}%</span><span class="of"> / </span><span class="down">{pctOf(sum.declined, sum.comparable)}%</span></div>
        <div class="bar split"><span class="pos" style="width: {pctOf(sum.grew, sum.comparable)}%"></span><span class="neg" style="width: {pctOf(sum.declined, sum.comparable)}%"></span></div>
        <div class="sub">grew / declined · {sum.comparable} comparable</div>
      </div>
      <div class="card stat"><div class="label">Median sales growth</div><div class="value {(sum.median_sales_yoy ?? 0) >= 0 ? 'up' : 'down'}">{signed(sum.median_sales_yoy)}</div><div class="sub">year on year, all reporters</div></div>
      <div class="card stat"><div class="label">Median profit growth</div><div class="value {(sum.median_profit_yoy ?? 0) >= 0 ? 'up' : 'down'}">{signed(sum.median_profit_yoy)}</div><div class="sub">year on year, all reporters</div></div>
      <div class="card stat"><div class="label">Operating margin</div><div class="value"><span class="up">{sum.margin_up}</span><span class="of"> / </span><span class="down">{sum.margin_down}</span></div><div class="sub">expanded / shrank vs a year ago</div></div>
      <div class="card stat">
        <div class="label">Strongest / weakest</div>
        {#if sum.strongest}
          <p class="sect"><b>{sum.strongest.sector}</b> <span class="up mono">{signed(sum.strongest.median_profit_yoy)}</span></p>
          {#if sum.weakest}<p class="sect"><b>{sum.weakest.sector}</b> <span class="down mono">{signed(sum.weakest.median_profit_yoy)}</span></p>{/if}
          <div class="sub">median profit growth, 5+ reporters</div>
        {:else}<div class="value">—</div><div class="sub">needs 5+ reporters in a sector</div>{/if}
      </div>
    </div>

    <nav class="tabs main" aria-label="View">
      {#each [["declared", "Declared"], ["sectors", "Sectors"], ["leaderboard", "Leaderboard"], ["calendar", "Calendar & documents"]] as [k, label]}
        <a href={href({ tab: k === "declared" ? null : k })} class:active={data.tab === k} data-sveltekit-noscroll>{label}</a>
      {/each}
    </nav>

    {#if data.tab === "declared"}
      <div class="controls">
        <nav class="chips" aria-label="Sort">
          {#each SORTS as [k, label]}<a href={href({ sort: k === "largest" ? null : k })} class="chip" class:on={data.sort === k} data-sveltekit-noscroll>{label}</a>{/each}
        </nav>
        <div class="selects">
          <select aria-label="Sector" onchange={(e) => goto(href({ sector: e.currentTarget.value || null }), { noScroll: true })}>
            <option value="">All sectors</option>
            {#each sectorNames as name}<option value={name} selected={data.sector === name}>{name}</option>{/each}
          </select>
          <select aria-label="Result" onchange={(e) => goto(href({ result: e.currentTarget.value || null }), { noScroll: true })}>
            <option value="">Any result</option>
            {#each RESULTS as r}<option value={r} selected={data.result === r}>{r}</option>{/each}
          </select>
          <span class="sub">{s.total ? `1–${rows.length} of ${s.total}` : "No companies"}</span>
        </div>
      </div>

      <section class="card">
        <div class="table-scroll">
          <table class="results">
            <thead>
              <tr class="group"><th colspan="2">Company</th><th colspan="3" class="grp">Revenue (₹ Cr)</th><th colspan="3" class="grp">Net profit (₹ Cr)</th><th class="grp">Per share</th><th colspan="2" class="grp">Quarter</th></tr>
              <tr><th>Symbol</th><th class="left wide-only">Sector</th><th>Reported</th><th>YoY</th><th class="wide-only">QoQ</th><th>Reported</th><th>YoY</th><th class="wide-only">QoQ</th><th class="wide-only">EPS (₹)</th><th class="left">Verdict</th><th class="left">8Q profit</th></tr>
            </thead>
            <tbody>
              {#each rows as r (r.symbol)}
                <tr>
                  <td><a href="/stock/{r.symbol}?tab=financials" class="sym">{r.symbol}</a><span class="name">{r.name}</span></td>
                  <td class="left wide-only sector">{r.sector}</td>
                  <td>{crore(r.revenue)}</td>
                  <td style={tint(r.sales_yoy)} class={r.sales_yoy == null ? "na" : r.sales_yoy >= 0 ? "up" : "down"}>{signed(r.sales_yoy)}</td>
                  <td class="wide-only {r.sales_qoq == null ? 'na' : r.sales_qoq >= 0 ? 'up' : 'down'}">{signed(r.sales_qoq)}</td>
                  <td class={(r.net_profit ?? 0) < 0 ? "down" : ""}>{crore(r.net_profit)}</td>
                  <td style={tint(r.profit_yoy)} class={r.profit_yoy == null ? "na" : r.profit_yoy >= 0 ? "up" : "down"}>{signed(r.profit_yoy)}</td>
                  <td class="wide-only {r.profit_qoq == null ? 'na' : r.profit_qoq >= 0 ? 'up' : 'down'}">{signed(r.profit_qoq)}</td>
                  <td class="wide-only">{r.eps == null ? "—" : num(r.eps)}</td>
                  <td class="left"><span class="chip verdict {VERDICT_TONE[r.verdict]}">{r.verdict}</span></td>
                  <td class="left"><Sparkline values={r.trend.map((t) => t.net_profit)} labels={r.trend.map((t) => qShort(t.quarter))} rising={r.profit_yoy != null ? r.profit_yoy >= 0 : r.verdict === "Back to profit" ? true : r.verdict === "Loss" ? false : undefined} /></td>
                </tr>
              {:else}
                <tr><td colspan="11" class="empty">No companies match these filters.</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if s.total > rows.length}<a class="more" href={href({ n: data.n + 100 })} data-sveltekit-noscroll>Show 100 more of {s.total - rows.length} →</a>{/if}
      </section>
      <p class="sub small">Verdict: <b>Growing</b> sales and profit both up on a year ago · <b>Shrinking</b> both down · <b>Mixed</b> one up, one down · <b>Back to profit</b> a profit after a loss a year ago · <b>Loss</b> a loss this quarter. "n/a" means a year-ago or previous figure isn't available, or it was a loss, so a percentage would mislead.</p>
    {:else if data.tab === "sectors"}
      <section class="card">
        <div class="table-scroll">
          <table>
            <thead><tr><th>Sector</th><th>Reported</th><th>Revenue (₹ Cr)</th><th>Net profit (₹ Cr)</th><th>Median sales YoY</th><th>Median profit YoY</th><th class="left">Share that grew profit</th></tr></thead>
            <tbody>
              {#each s.sectors as x (x.sector)}
                <tr>
                  <td><a href={href({ tab: null, sector: x.sector })}>{x.sector}</a></td>
                  <td>{x.companies}</td>
                  <td>{crore(x.revenue)}</td>
                  <td>{crore(x.net_profit)}</td>
                  <td style={tint(x.median_sales_yoy)} class={x.median_sales_yoy == null ? "na" : x.median_sales_yoy >= 0 ? "up" : "down"}>{signed(x.median_sales_yoy)}</td>
                  <td style={tint(x.median_profit_yoy)} class={x.median_profit_yoy == null ? "na" : x.median_profit_yoy >= 0 ? "up" : "down"}>{signed(x.median_profit_yoy)}</td>
                  <td class="left">{#if x.pct_grew != null}<span class="minibar"><span style="width: {x.pct_grew}%"></span></span> <span class="mono">{x.pct_grew}%</span>{:else}—{/if}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
      <p class="sub small">Click a sector to see its companies. Medians are the middle company, so one huge result can't skew them.</p>
    {:else if data.tab === "leaderboard"}
      <div class="boards">
        {#each boards as b (b.title)}
          <section class="card">
            <div class="card-head"><h2>{b.title}</h2></div>
            {#if b.rows.length}
              <ol class="board">
                {#each b.rows as r (r.symbol)}
                  <li><a href="/stock/{r.symbol}?tab=financials" class="sym">{r.symbol}</a><span class="name">{r.name}</span><b class="mono {VERDICT_TONE[r.verdict]}">{b.value(r)}</b></li>
                {/each}
              </ol>
            {:else}<div class="empty">None yet.</div>{/if}
          </section>
        {/each}
      </div>
      <p class="sub small">Companies with at least ₹100 Cr revenue this quarter; the profit lists also need ₹10 Cr+ profit a year ago, so a jump from almost nothing doesn't top them.</p>
    {:else}
      <ResultsCalendar events={data.events} companies={data.companies} date={data.date} only={data.only} base={data.search} />
    {/if}
  {/if}
</div>

<style>
  .lede { font-size: 15px; line-height: 1.65; color: var(--ink-2); max-width: 1000px; }
  .lede b { color: var(--ink); font-weight: 600; }
  .kpis { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; }
  @media (max-width: 1100px) { .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: 640px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .kpis .value { font-size: 19px; }
  .of { color: var(--ink-3); font-size: 14px; font-weight: 400; }
  .bar { display: flex; height: 3px; border-radius: 2px; background: var(--panel-2); margin: 10px 0 6px; overflow: hidden; }
  .bar .fill { background: var(--accent); }
  .bar .pos { background: var(--up); }
  .bar .neg { background: var(--down); }
  .bar.split { gap: 2px; }
  .sect { font-size: 12.5px; margin-top: 4px; display: flex; justify-content: space-between; gap: 6px; }
  .sect b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .tabs.main { border-bottom: 1px solid var(--line); gap: 26px; }
  .tabs.main a { padding: 10px 0; font-size: 14px; }
  .controls { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; align-items: center; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chips .chip { padding: 6px 12px; font-size: 12.5px; border: 1px solid var(--line); background: var(--panel); color: var(--ink-2); }
  .chips .chip.on { border-color: var(--accent); color: var(--ink); }
  .selects { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

  .results .group th { height: 30px; font-size: 11px; color: var(--ink-3); border-bottom: 0; }
  .results th.grp { text-align: center; border-left: 1px solid var(--line); }
  .sector { color: var(--ink-2); font-size: 12.5px; max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
  td.na { color: var(--ink-3); }
  .verdict.up { background: var(--up-soft); color: var(--up); }
  .verdict.down { background: var(--down-soft); color: var(--down); }
  .more { display: block; padding: 12px 18px; border-top: 1px solid var(--line); font-size: 13px; color: var(--brand-2); }

  .minibar { display: inline-block; width: 90px; height: 6px; border-radius: 3px; background: var(--down-soft); vertical-align: middle; overflow: hidden; }
  .minibar span { display: block; height: 100%; background: var(--up); }
  .boards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
  @media (max-width: 760px) { .boards { grid-template-columns: 1fr; } }
  .board { list-style: none; margin: 0; padding: 4px 0; counter-reset: rank; }
  .board li { display: grid; grid-template-columns: 22px auto 1fr auto; gap: 10px; align-items: baseline; padding: 9px 18px; border-bottom: 1px solid var(--line); counter-increment: rank; }
  .board li:last-child { border-bottom: 0; }
  .board li::before { content: counter(rank); color: var(--ink-3); font: 12px var(--mono); }
  .board .name { max-width: none; }
  .board b { font-weight: 500; font-size: 13px; }
  .small { font-size: 12.5px; line-height: 1.6; }
  @media (max-width: 640px) {
    .wide-only { display: none; }
    /* Keep the company in view while the figures scroll sideways. */
    .results td:first-child, .results tr:not(.group) th:first-child { position: sticky; left: 0; z-index: 1; background: var(--panel); box-shadow: 1px 0 0 var(--line); }
  }
</style>
