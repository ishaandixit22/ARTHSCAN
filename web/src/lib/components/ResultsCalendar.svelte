<script lang="ts">
  // Upcoming results dates (NSE board-meeting calendar) and this season's
  // documents per company. The Earnings tracker's "Calendar & documents" tab.
  import DocLinks from "$lib/components/DocLinks.svelte";
  import { todayIST } from "$lib/format";

  type Ev = { date: string; symbol: string; company: string; purpose: string; details: string };
  type Doc = { time: string | null; subject: string; pdf: string | null };
  type Company = { symbol: string; company: string; latest: string; docs: Record<string, Doc[]> };
  let { events, companies, date, only, base }: { events: Ev[] | null; companies: Company[] | null; date: string | null; only: string; base: string } = $props();

  const docsBy = $derived(new Map((companies ?? []).map((c) => [c.symbol, c.docs])));
  const today = todayIST();
  const days = $derived.by(() => {
    const m = new Map<string, number>();
    for (const e of events ?? []) if (e.date >= today) m.set(e.date, (m.get(e.date) ?? 0) + 1);
    return [...m];
  });
  const picked = $derived(days.find(([d]) => d === date)?.[0] ?? days[0]?.[0] ?? null);
  const onDay = $derived((events ?? []).filter((e) => e.date === picked));
  const FILTERS = [["", "All"], ["results", "With results"], ["transcript", "With transcript"], ["presentation", "With presentation"]] as const;
  const season = $derived((companies ?? []).filter((c) => (c.docs.results?.length || c.docs.transcript?.length || c.docs.presentation?.length) && (!only || c.docs[only]?.length)));
  const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const filed = (t: string) => (t ? new Date(`${t.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }) + (t.length > 10 ? `, ${t.slice(11)}` : "") : "—");
  const link = (p: Record<string, string>) => {
    const q = new URLSearchParams(base);
    for (const [k, v] of Object.entries(p)) v ? q.set(k, v) : q.delete(k);
    return `?${q}`;
  };
</script>

<section class="card">
  <div class="card-head"><h2>Results calendar</h2><span class="sub">board meetings to consider results · con-call details where filed</span></div>
  {#if !events}
    <div class="empty">The results calendar isn't available from NSE right now.</div>
  {:else if !days.length}
    <div class="empty">No results board meetings are scheduled yet.</div>
  {:else}
    <nav class="days" aria-label="Results date">
      {#each days as [d, n]}
        <a href={link({ date: d })} class:on={d === picked} data-sveltekit-noscroll aria-current={d === picked ? "date" : undefined}><span>{dayLabel(d)}</span><b class="mono">{n}</b></a>
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
              <td class="left">{#if docsBy.get(e.symbol)?.concall?.some((d) => d.pdf)}<DocLinks docs={docsBy.get(e.symbol)} only={["concall"]} filedOnly />{:else}<span class="sub">—</span>{/if}</td>
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
    <div><h2>Results season documents</h2><p class="sub note">Last 14 days, latest filer first. Dimmed means not filed yet.</p></div>
    <nav class="tabs" aria-label="Filter companies">
      {#each FILTERS as [k, label]}<a href={link({ only: k })} class:active={only === k} data-sveltekit-noscroll>{label}</a>{/each}
    </nav>
  </div>
  {#if !companies}
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
  {/if}
</section>

<style>
  .days { display: flex; gap: 8px; overflow-x: auto; padding: 14px 18px; border-bottom: 1px solid var(--line); scrollbar-width: thin; }
  .days a { display: grid; gap: 2px; min-width: 92px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 6px; font-size: 12.5px; color: var(--ink-2); flex-shrink: 0; }
  .days a:hover { border-color: var(--line-2); color: var(--ink); }
  .days a.on { border-color: var(--accent); color: var(--ink); }
  .days b { font-size: 16px; font-weight: 500; color: var(--ink); }
  .details { white-space: normal; min-width: 300px; color: var(--ink-2); font-size: 12.5px; }
  .note { margin-top: 4px; font-size: 12.5px; }
  @media (max-width: 640px) { .wide-only { display: none; } }
</style>
