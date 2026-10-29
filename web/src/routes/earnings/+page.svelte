<script lang="ts">
  import { BRAND } from "$lib/brand";
  import DocLinks from "$lib/components/DocLinks.svelte";
  import { fetchedAt, todayIST } from "$lib/format";

  let { data } = $props();
  type Ev = { date: string; symbol: string; company: string; purpose: string; details: string };
  type Doc = { time: string | null; subject: string; pdf: string | null };
  type Company = { symbol: string; company: string; latest: string; docs: Record<string, Doc[]> };
  const events = $derived((data.events ?? []) as Ev[]);
  const companies = $derived((data.companies ?? []) as Company[]);
  const docsBy = $derived(new Map(companies.map((c) => [c.symbol, c.docs])));
  const today = todayIST();

  // Upcoming results dates, one button per day.
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

  // Results season: companies that have filed results, a transcript or a presentation.
  const FILTERS = [["", "All"], ["results", "With results"], ["transcript", "With transcript"], ["presentation", "With presentation"]] as const;
  const season = $derived(
    companies.filter((c) => (c.docs.results?.length || c.docs.transcript?.length || c.docs.presentation?.length) && (!data.only || c.docs[data.only]?.length)),
  );
  const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const filed = (t: string) => (t ? new Date(`${t.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }) + (t.length > 10 ? `, ${t.slice(11)}` : "") : "—");
</script>

<svelte:head><title>Earnings tracker — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>Earnings tracker</h1>
      <p class="sub">Who reports results and when, and every company's results-season documents in one row: results, press release, investor presentation, con call and transcript, each opening the filing on NSE.{#if data.fetched_at}{" "}Fetched {fetchedAt(data.fetched_at)}.{/if}</p>
    </div>
  </div>

  <div class="grid grid-3">
    <div class="card stat"><div class="label">Reporting in the next 7 days</div><div class="value">{thisWeek}</div><div class="sub">companies with a results board meeting</div></div>
    <div class="card stat"><div class="label">Results filed · last 7 days</div><div class="value">{data.counts?.results ?? "—"}</div><div class="sub">results and board outcomes with figures</div></div>
    <div class="card stat"><div class="label">Call transcripts · last 7 days</div><div class="value">{data.counts?.transcript ?? "—"}</div><div class="sub">plus {data.counts?.presentation ?? 0} investor presentations</div></div>
  </div>

  <section class="card">
    <div class="card-head"><h2>Results calendar</h2><span class="sub">board meetings to consider financial results · con-call details where filed</span></div>
    {#if !data.events}
      <div class="empty">The results calendar isn't available from NSE right now.</div>
    {:else if !days.length}
      <div class="empty">No results board meetings are scheduled yet.</div>
    {:else}
      <nav class="days" aria-label="Results date">
        {#each days as [d, n]}
          <a href="?date={d}{data.only ? `&only=${data.only}` : ''}" class:on={d === picked} data-sveltekit-noscroll aria-current={d === picked ? "date" : undefined}>
            <span>{dayLabel(d)}</span><b class="mono">{n}</b>
          </a>
        {/each}
      </nav>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Company</th><th class="left">Purpose</th><th class="left">Con call</th><th class="left wide-only">Details</th></tr></thead>
          <tbody>
            {#each onDay as e, i (e.symbol + i)}
              <tr>
                <td><a href="/stock/{e.symbol}" class="sym">{e.symbol}</a><span class="name">{e.company}</span></td>
                <td class="left">{e.purpose}</td>
                <td class="left">{#if docsBy.get(e.symbol)?.concall?.length}<DocLinks docs={docsBy.get(e.symbol)} only={["concall"]} filedOnly />{:else}<span class="sub">—</span>{/if}</td>
                <td class="left wide-only details">{e.details}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <section class="card">
    <div class="card-head">
      <div>
        <h2>Results season documents</h2>
        <p class="sub note">Last 14 days, latest filer first. Hover a document for its subject; dimmed means not filed yet.</p>
      </div>
      <nav class="tabs" aria-label="Filter companies">
        {#each FILTERS as [k, label]}
          <a href="?only={k}{data.date ? `&date=${data.date}` : ''}" class:active={data.only === k} data-sveltekit-noscroll>{label}</a>
        {/each}
      </nav>
    </div>
    {#if !data.companies}
      <div class="empty">Filings aren't available from NSE right now.</div>
    {:else if !season.length}
      <div class="empty">No companies match.</div>
    {:else}
      <div class="table-scroll">
        <table>
          <thead><tr><th>Company</th><th class="left">Documents</th><th>Latest filing</th></tr></thead>
          <tbody>
            {#each season.slice(0, 150) as c (c.symbol)}
              <tr>
                <td><a href="/stock/{c.symbol}?tab=filings" class="sym">{c.symbol}</a><span class="name">{c.company}</span></td>
                <td class="left"><DocLinks docs={c.docs} /></td>
                <td>{filed(c.latest)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if season.length > 150}<p class="more sub">Showing the latest 150 of {season.length} companies. <a href="/filings?kind=results&days=7">All results filings →</a></p>{/if}
    {/if}
  </section>
  <p class="sub small">Source: NSE event calendar and corporate announcements. The documents are the companies' own filings, opened from NSE's archive.</p>
</div>

<style>
  .days { display: flex; gap: 8px; overflow-x: auto; padding: 14px 18px; border-bottom: 1px solid var(--line); scrollbar-width: thin; }
  .days a { display: grid; gap: 2px; min-width: 92px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 6px; font-size: 12.5px; color: var(--ink-2); flex-shrink: 0; transition: border-color 0.15s var(--ease); }
  .days a:hover { border-color: var(--line-2); color: var(--ink); }
  .days a.on { border-color: var(--accent); color: var(--ink); }
  .days b { font-size: 16px; font-weight: 500; color: var(--ink); }
  .details { white-space: normal; min-width: 300px; color: var(--ink-2); font-size: 12.5px; }
  .note { margin-top: 4px; font-size: 12.5px; }
  .more { padding: 12px 18px; border-top: 1px solid var(--line); }
  .small { font-size: 12.5px; }
  @media (max-width: 640px) { .wide-only { display: none; } }
</style>
