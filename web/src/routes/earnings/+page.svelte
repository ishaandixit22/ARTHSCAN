<script lang="ts">
  import { BRAND } from "$lib/brand";
  import FilingList from "$lib/components/FilingList.svelte";
  import { date, fetchedAt, todayIST } from "$lib/format";

  let { data } = $props();
  type Ev = { date: string; symbol: string; company: string; purpose: string; details: string };
  const events = $derived((data.events ?? []) as Ev[]);
  const today = todayIST();
  const days = $derived.by(() => {
    const m = new Map<string, number>();
    for (const e of events) if (e.date >= today) m.set(e.date, (m.get(e.date) ?? 0) + 1);
    return [...m];
  });
  const picked = $derived(days.find(([d]) => d === data.date)?.[0] ?? days[0]?.[0] ?? null);
  const onDay = $derived(events.filter((e) => e.date === picked));
  const weekEnd = (() => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().slice(0, 10);
  })();
  const thisWeek = $derived(events.filter((e) => e.date >= today && e.date < weekEnd).length);
  const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
</script>

<svelte:head><title>Earnings tracker — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>Earnings tracker</h1>
      <p class="sub">Which companies report results and when, the results filed in the last two days, and this week's earnings-call transcripts and investor presentations, each with its PDF.{#if data.fetched_at}{" "}Fetched {fetchedAt(data.fetched_at)}.{/if}</p>
    </div>
  </div>

  <div class="grid grid-3">
    <div class="card stat"><div class="label">Reporting in the next 7 days</div><div class="value">{thisWeek}</div><div class="sub">companies with a results board meeting</div></div>
    <div class="card stat"><div class="label">Results filed · last 2 days</div><div class="value">{data.resultsTotal ?? "—"}</div><div class="sub">results and board outcomes with figures</div></div>
    <div class="card stat"><div class="label">Call transcripts · last 7 days</div><div class="value">{data.callCounts?.transcript ?? "—"}</div><div class="sub">plus {data.callCounts?.presentation ?? 0} investor presentations</div></div>
  </div>

  <section class="card">
    <div class="card-head"><h2>Results calendar</h2><span class="sub">board meetings to consider financial results</span></div>
    {#if !data.events}
      <div class="empty">The results calendar isn't available from NSE right now.</div>
    {:else if !days.length}
      <div class="empty">No results board meetings are scheduled yet.</div>
    {:else}
      <nav class="days" aria-label="Results date">
        {#each days as [d, n]}
          <a href="?date={d}" class:on={d === picked} data-sveltekit-noscroll aria-current={d === picked ? "date" : undefined}>
            <span>{dayLabel(d)}</span><b class="mono">{n}</b>
          </a>
        {/each}
      </nav>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Company</th><th class="left">Purpose</th><th class="left wide-only">Details</th></tr></thead>
          <tbody>
            {#each onDay as e, i (e.symbol + i)}
              <tr>
                <td><a href="/stock/{e.symbol}" class="sym">{e.symbol}</a><span class="name">{e.company}</span></td>
                <td class="left">{e.purpose}</td>
                <td class="left wide-only details">{e.details}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <div class="grid grid-2">
    <section class="card">
      <div class="card-head"><h2>Results filed</h2><a class="sub" href="/filings?kind=results">All results →</a></div>
      {#if data.results}
        <FilingList filings={data.results.slice(0, 25)} kinds={data.kinds} empty="No results filed in the last two days." />
      {:else}
        <div class="empty">Filings aren't available from NSE right now.</div>
      {/if}
    </section>
    <section class="card">
      <div class="card-head"><h2>Call transcripts and presentations</h2><a class="sub" href="/filings?kind=transcript&days=7">All transcripts →</a></div>
      {#if data.calls}
        <FilingList filings={data.calls.slice(0, 25)} kinds={data.kinds} empty="No transcripts or presentations this week." />
      {:else}
        <div class="empty">Filings aren't available from NSE right now.</div>
      {/if}
    </section>
  </div>
  <p class="sub small">Source: NSE event calendar and corporate announcements. Transcripts, presentations and results are the companies' own filings, opened from NSE's archive.</p>
</div>

<style>
  .days { display: flex; gap: 8px; overflow-x: auto; padding: 14px 18px; border-bottom: 1px solid var(--line); scrollbar-width: thin; }
  .days a { display: grid; gap: 2px; min-width: 92px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 6px; font-size: 12.5px; color: var(--ink-2); flex-shrink: 0; transition: border-color 0.15s var(--ease); }
  .days a:hover { border-color: var(--line-2); color: var(--ink); }
  .days a.on { border-color: var(--accent); color: var(--ink); }
  .days b { font-size: 16px; font-weight: 500; color: var(--ink); }
  .details { white-space: normal; min-width: 320px; color: var(--ink-2); font-size: 12.5px; }
  .small { font-size: 12.5px; }
  @media (max-width: 640px) { .wide-only { display: none; } }
</style>
