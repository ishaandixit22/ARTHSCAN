<script lang="ts">
  import { BRAND } from "$lib/brand";
  import DocLinks from "$lib/components/DocLinks.svelte";
  import { fetchedAt, todayIST } from "$lib/format";

  let { data } = $props();
  type Ev = { date: string; symbol: string; company: string; purpose: string; details: string };
  const today = todayIST();
  const docsBy = $derived(new Map((data.companies as { symbol: string; docs: Record<string, any[]> }[]).map((c) => [c.symbol, c.docs])));
  const all = $derived(((data.ev?.events ?? []) as Ev[]).filter((e) => e.date >= today));
  // Purposes combine ("Financial Results/Dividend"); filter on each part.
  const FILTERS = [
    ["results", "Financial results", /financial result/i],
    ["dividend", "Dividend", /dividend/i],
    ["funds", "Fund raising", /fund raising/i],
    ["buyback", "Buyback", /buyback/i],
    ["other", "Other business", /other business/i],
  ] as const;
  const active = $derived(FILTERS.find(([k]) => k === data.purpose));
  const shown = $derived(active ? all.filter((e) => active[2].test(e.purpose)) : all);
  const byDate = $derived.by(() => {
    const m = new Map<string, Ev[]>();
    for (const e of shown) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return [...m];
  });
  const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
</script>

<svelte:head><title>Board meetings — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>Board meetings</h1>
      <p class="sub">Board meetings that NSE-listed companies have announced, what each will consider, and the company's documents from the last two weeks (con-call details, presentation, results) where filed.{#if data.ev}{" "}{all.length} meetings ahead · fetched {fetchedAt(data.ev.fetched_at)}.{/if}</p>
    </div>
  </div>

  {#if data.error}
    <div class="notice">{data.error}</div>
  {:else}
    <nav class="tabs bar" aria-label="Purpose">
      <a href="?" class:active={!active} data-sveltekit-noscroll>All <span class="n">{all.length}</span></a>
      {#each FILTERS as [k, label, re]}
        <a href="?purpose={k}" class:active={data.purpose === k} data-sveltekit-noscroll>{label} <span class="n">{all.filter((e) => re.test(e.purpose)).length}</span></a>
      {/each}
    </nav>

    {#each byDate as [d, rows] (d)}
      <section class="card">
        <div class="card-head"><h2>{dayLabel(d)}{d === today ? " · today" : ""}</h2><span class="sub">{rows.length} meetings</span></div>
        <div class="table-scroll">
          <table>
            <thead><tr><th>Company</th><th class="left">Purpose</th><th class="left">Documents</th><th class="left wide-only">Details</th></tr></thead>
            <tbody>
              {#each rows as e, i (e.symbol + i)}
                <tr>
                  <td><a href="/stock/{e.symbol}" class="sym">{e.symbol}</a><span class="name">{e.company}</span></td>
                  <td class="left purpose">{e.purpose}</td>
                  <td class="left">{#if ["concall", "presentation", "results"].some((k) => docsBy.get(e.symbol)?.[k]?.some((d: any) => d.pdf))}<DocLinks docs={docsBy.get(e.symbol)} only={["concall", "presentation", "results"]} filedOnly />{:else}<span class="sub">None filed yet</span>{/if}</td>
                  <td class="left wide-only details">{e.details}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {:else}
      <div class="card empty">No meetings of this kind are scheduled.</div>
    {/each}
    <p class="sub small">Source: NSE event calendar.</p>
  {/if}
</div>

<style>
  .bar { flex-wrap: wrap; gap: 4px 20px; border-bottom: 1px solid var(--line); display: flex; }
  .bar a { padding: 9px 0; }
  .n { color: var(--ink-3); font-family: var(--mono); font-size: 11.5px; margin-left: 3px; }
  .purpose { white-space: normal; min-width: 180px; }
  td:has(:global(.docs)) { min-width: 210px; }
  .details { white-space: normal; min-width: 340px; color: var(--ink-2); font-size: 12.5px; }
  .small { font-size: 12.5px; }
  @media (max-width: 640px) { .wide-only { display: none; } }
</style>
