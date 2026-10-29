<script lang="ts">
  import { BRAND } from "$lib/brand";
  import { date } from "$lib/format";

  let { data } = $props();
  type Ev = { date: string; kind: "macro" | "expiry" | "holiday" | "results" | "ipo"; title: string; detail: string; impact: "high" | "medium" | "low"; symbol?: string; source: string; url?: string };
  const events = $derived((data.cal?.events ?? []) as Ev[]);
  const today = $derived(data.cal?.today as string);

  const KINDS: [Ev["kind"], string][] = [["macro", "Economy"], ["expiry", "F&O expiry"], ["holiday", "Market holidays"], ["results", "Big results"], ["ipo", "IPOs"]];
  const kindLabel = Object.fromEntries(KINDS);
  // Key events by default; weekly expiries and IPO dates come in with "All events".
  const shown = $derived(events.filter((e) => (!data.kind || e.kind === data.kind) && (data.all || data.kind || e.impact !== "low")));

  const daysTo = (d: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  const inDays = (d: string) => { const n = daysTo(d); return n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`; };
  const next = (pred: (e: Ev) => boolean) => events.find(pred);
  const highlights = $derived([
    { label: "RBI policy", e: next((e) => e.title.startsWith("RBI")) },
    { label: "US Fed decision", e: next((e) => e.title.startsWith("US Fed")) },
    { label: "India CPI", e: next((e) => e.title === "India CPI inflation") },
    { label: "Monthly expiry", e: next((e) => e.title === "Monthly F&O expiry") },
    { label: "Next holiday", e: next((e) => e.kind === "holiday") },
  ]);

  // Month → day → events.
  const months = $derived.by(() => {
    const out: { month: string; days: { date: string; events: Ev[] }[] }[] = [];
    for (const e of shown) {
      const m = e.date.slice(0, 7);
      let g = out.find((x) => x.month === m);
      if (!g) out.push((g = { month: m, days: [] }));
      let d = g.days.find((x) => x.date === e.date);
      if (!d) g.days.push((d = { date: e.date, events: [] }));
      d.events.push(e);
    }
    return out;
  });
  const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const dayNum = (d: string) => Number(d.slice(8, 10));
  const weekday = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });
  const href = (p: Record<string, string>) => {
    const q = new URLSearchParams({ ...(data.kind && { kind: data.kind }), ...(data.all && { all: "1" }), ...p });
    for (const [k, v] of [...q]) if (!v) q.delete(k);
    return q.size ? `?${q}` : "?";
  };
</script>

<svelte:head><title>Events calendar — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>Events calendar</h1>
      <p class="sub">The dates ahead that move Indian markets: RBI and Fed decisions, inflation, production and GDP data, F&amp;O expiries, market holidays, results from the most traded companies and IPOs. Next four months.</p>
    </div>
  </div>

  {#if data.error}
    <div class="notice">{data.error}</div>
  {:else}
    <div class="highlights">
      {#each highlights as h}
        <div class="card stat">
          <div class="label">{h.label}</div>
          {#if h.e}
            <div class="value">{date(h.e.date).replace(/ \d{4}$/, "")}</div>
            <div class="sub">{inDays(h.e.date)}{h.e.kind === "holiday" ? ` · ${h.e.title.split(":")[0]}` : ""}</div>
          {:else}
            <div class="value muted">—</div><div class="sub">not scheduled in this window</div>
          {/if}
        </div>
      {/each}
    </div>

    <div class="filters">
      <nav class="tabs" aria-label="Kind of event">
        <a href={href({ kind: "" })} class:active={!data.kind}>All</a>
        {#each KINDS as [k, label]}<a href={href({ kind: k })} class:active={data.kind === k}>{label}</a>{/each}
      </nav>
      {#if !data.kind}
        <a class="toggle" href={href({ all: data.all ? "" : "1" })}>{data.all ? "Key events only" : "Show weekly expiries and IPOs"}</a>
      {/if}
    </div>

    {#if data.cal?.missing?.length}
      <div class="notice">Not shown right now: {data.cal.missing.join(", ")} (the source didn't answer). Economic dates are always shown.</div>
    {/if}

    {#each months as m (m.month)}
      <section class="card">
        <div class="card-head"><h2>{monthName(m.month)}</h2><span class="sub">{m.days.reduce((n, d) => n + d.events.length, 0)} events</span></div>
        <ol class="timeline">
          {#each m.days as d (d.date)}
            <li class:soon={daysTo(d.date) <= 7}>
              <div class="when">
                <b class="mono">{dayNum(d.date)}</b>
                <span>{weekday(d.date)}</span>
                {#if daysTo(d.date) <= 7}<small>{inDays(d.date)}</small>{/if}
              </div>
              <ul>
                {#each d.events as e, i (e.title + i)}
                  <li class="ev {e.kind} {e.impact}">
                    <div class="top">
                      <span class="chip kind">{kindLabel[e.kind]}</span>
                      {#if e.impact === "high"}<span class="chip impact">High impact</span>{/if}
                      <span class="title">{#if e.symbol && e.kind === "results"}<a href="/stock/{e.symbol}?tab=filings">{e.title}</a>{:else}{e.title}{/if}</span>
                    </div>
                    <p class="detail">{e.detail}</p>
                    <p class="src">{#if e.url}<a href={e.url} target="_blank" rel="noopener noreferrer">{e.source}</a>{:else}{e.source}{/if}</p>
                  </li>
                {/each}
              </ul>
            </li>
          {/each}
        </ol>
      </section>
    {:else}
      <div class="card empty">No events of this kind in the next four months.</div>
    {/each}
    <p class="sub small">Economic dates come from the RBI, the US Federal Reserve and MoSPI's published calendars and are updated when they publish new ones. Expiries and holidays come from NSE; results dates from companies' board-meeting notices to NSE. The Union Budget (usually 1 February) is added once the government announces the date.</p>
  {/if}
</div>

<style>
  .highlights { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
  .highlights .value { font-size: 18px; }
  .muted { color: var(--ink-3); }
  @media (max-width: 1000px) { .highlights { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: 640px) { .highlights { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .filters { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px 24px; border-bottom: 1px solid var(--line); }
  .filters .tabs { flex-wrap: wrap; gap: 4px 20px; }
  .filters .tabs a { padding: 9px 0; }
  .toggle { font-size: 13px; color: var(--brand-2); }

  .timeline { list-style: none; margin: 0; padding: 0; }
  .timeline > li { display: grid; grid-template-columns: 84px 1fr; gap: 18px; padding: 16px 18px; border-bottom: 1px solid var(--line); }
  .timeline > li:last-child { border-bottom: 0; }
  .timeline > li.soon .when b { color: var(--accent); }
  .when { display: grid; align-content: start; gap: 1px; }
  .when b { font-size: 24px; font-weight: 500; line-height: 1; }
  .when span { font-size: 12.5px; color: var(--ink-3); }
  .when small { font-size: 11.5px; color: var(--brand-2); margin-top: 2px; }
  .timeline ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
  .ev { padding-left: 12px; border-left: 2px solid var(--line-2); }
  .ev.high { border-left-color: var(--down); }
  .ev.macro.medium { border-left-color: var(--warn); }
  .ev.holiday { border-left-color: var(--ink-3); }
  .top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .title { font-weight: 600; font-size: 14.5px; }
  .chip.impact { background: var(--down-soft); color: var(--down); }
  .detail { margin-top: 4px; font-size: 13.5px; color: var(--ink-2); line-height: 1.5; max-width: 860px; }
  .src { margin-top: 3px; font-size: 12px; color: var(--ink-3); }
  .src a { text-decoration: underline; text-decoration-color: var(--line-2); }
  .small { font-size: 12.5px; }
  @media (max-width: 640px) { .timeline > li { grid-template-columns: 52px 1fr; gap: 12px; } .when b { font-size: 20px; } }
</style>
