<script lang="ts">
  import { BRAND } from "$lib/brand";
  import FilingList from "$lib/components/FilingList.svelte";
  import { date, fetchedAt } from "$lib/format";

  let { data } = $props();
  const f = $derived(data.filings);
  const ORDER = ["results", "transcript", "concall", "presentation", "press", "board", "action", "other"];
  const href = (p: Record<string, string>) => {
    const q = new URLSearchParams({ ...(data.kind && { kind: data.kind }), ...(data.symbol && { symbol: data.symbol }), ...(data.days !== "2" && { days: data.days }), ...p });
    for (const [k, v] of [...q]) if (!v) q.delete(k);
    const s = q.toString();
    return s ? `?${s}` : "?";
  };
</script>

<svelte:head><title>Company filings — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>{data.symbol ? `${data.symbol} filings` : "Company filings"}</h1>
      <p class="sub">
        Every filing NSE-listed companies make to the exchange, newest first, with the original PDF: results, earnings-call
        transcripts, investor presentations, press releases and board outcomes.
        {#if f}{" "}{data.symbol ? `Last 12 months.` : `${date(f.from)} – ${date(f.to)}.`} Fetched {fetchedAt(f.fetched_at)}.{/if}
      </p>
    </div>
    <form class="lookup" method="get" role="search">
      {#if data.kind}<input type="hidden" name="kind" value={data.kind} />{/if}
      <input name="symbol" value={data.symbol} placeholder="One company, e.g. TCS" aria-label="Show filings for one NSE symbol" autocomplete="off" />
      <button class="btn small">Show</button>
      {#if data.symbol}<a class="btn small" href={href({ symbol: "" })}>All companies</a>{/if}
    </form>
  </div>

  {#if data.error}
    <div class="notice">{data.error}</div>
  {:else if f}
    <div class="filters">
      <nav class="tabs" aria-label="Kind of filing">
        <a href={href({ kind: "" })} class:active={!data.kind}>All <span class="n">{Object.values(f.counts).reduce((a: number, b: any) => a + b, 0)}</span></a>
        {#each ORDER as k}
          {#if f.counts[k]}<a href={href({ kind: k })} class:active={data.kind === k}>{f.kinds[k]} <span class="n">{f.counts[k]}</span></a>{/if}
        {/each}
      </nav>
      {#if !data.symbol}
        <nav class="tabs" aria-label="Period">
          {#each [["1", "Today"], ["2", "2 days"], ["7", "7 days"]] as [d, label]}
            <a href={href({ days: d === "2" ? "" : d })} class:active={data.days === d}>{label}</a>
          {/each}
        </nav>
      {/if}
    </div>

    <section class="card">
      <FilingList filings={f.filings} kinds={f.kinds} showCompany={!data.symbol} empty="No filings of this kind in this period." />
      {#if f.total > f.filings.length}<p class="more sub">Showing the latest {f.filings.length} of {f.total}. Pick a kind or a company to narrow it down.</p>{/if}
    </section>
    <p class="sub small">Source: NSE corporate announcements. PDFs open from NSE's archive. Filings are the companies' own; Arthscan only lists them.</p>
  {/if}
</div>

<style>
  .lookup { display: flex; gap: 8px; align-items: center; }
  .lookup input { width: 200px; text-transform: uppercase; }
  .lookup input::placeholder { text-transform: none; }
  .filters { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px 24px; border-bottom: 1px solid var(--line); }
  .filters .tabs { flex-wrap: wrap; gap: 4px 20px; }
  .filters .tabs a { padding: 9px 0; }
  .n { color: var(--ink-3); font-family: var(--mono); font-size: 11.5px; margin-left: 3px; }
  .more { padding: 12px 18px; border-top: 1px solid var(--line); }
  .small { font-size: 12.5px; }
  @media (max-width: 640px) { .lookup { width: 100%; } .lookup input { flex: 1; width: auto; } }
</style>
