<script lang="ts">
  import { BRAND } from "$lib/brand";
  import { date, fetchedAt } from "$lib/format";

  let { data } = $props();
  type Action = { symbol: string; company: string; subject: string; type: string; ex_date: string | null; record_date: string | null };
  const all = $derived((data.ca?.actions ?? []) as Action[]);
  const today = $derived(data.ca?.today as string);
  const TYPES = ["Dividend", "Bonus", "Split", "Rights", "Buyback", "Demerger", "Meeting", "Other"];
  const counts = $derived(Object.fromEntries(TYPES.map((t) => [t, all.filter((a) => a.type === t).length])));
  const shown = $derived(TYPES.includes(data.type) ? all.filter((a) => a.type === data.type) : all);
  const upcoming = $derived(shown.filter((a) => (a.ex_date ?? "") >= today));
  const past = $derived(shown.filter((a) => (a.ex_date ?? "") < today).reverse());
  const sections = $derived([
    { title: "Coming up", rows: upcoming, none: "No actions coming up in the next month." },
    { title: "Past week", rows: past, none: "None in the past week." },
  ]);
</script>

<svelte:head><title>Corporate actions — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>Corporate actions</h1>
      <p class="sub">Dividends, bonuses, splits, rights issues and buybacks on NSE, from a week ago to a month ahead. Buy before the ex-date to be entitled.{#if data.ca}{" "}Fetched {fetchedAt(data.ca.fetched_at)}.{/if}</p>
    </div>
  </div>

  {#if data.error}
    <div class="notice">{data.error}</div>
  {:else}
    <nav class="tabs bar" aria-label="Kind of action">
      <a href="?" class:active={!TYPES.includes(data.type)} data-sveltekit-noscroll>All <span class="n">{all.length}</span></a>
      {#each TYPES as t}
        {#if counts[t]}<a href="?type={t}" class:active={data.type === t} data-sveltekit-noscroll>{t} <span class="n">{counts[t]}</span></a>{/if}
      {/each}
    </nav>

    {#each sections as { title, rows, none } (title)}
      <section class="card">
        <div class="card-head"><h2>{title}</h2><span class="sub">{rows.length} actions</span></div>
        {#if rows.length}
          <div class="table-scroll">
            <table>
              <thead><tr><th>Ex-date</th><th class="left">Company</th><th class="left">Action</th><th class="wide-only">Record date</th></tr></thead>
              <tbody>
                {#each rows as a, i (a.symbol + a.subject + i)}
                  <tr class:today={a.ex_date === today}>
                    <td>{date(a.ex_date)}{#if a.ex_date === today} <span class="chip">today</span>{/if}</td>
                    <td class="left"><a href="/stock/{a.symbol}" class="sym">{a.symbol}</a><span class="name">{a.company}</span></td>
                    <td class="left subject"><span class="chip type">{a.type}</span> {a.subject}</td>
                    <td class="wide-only">{date(a.record_date)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <div class="empty">{none}</div>
        {/if}
      </section>
    {/each}
    <p class="sub small">Source: NSE corporate actions. Amounts and ratios are as the company announced them.</p>
  {/if}
</div>

<style>
  .bar { flex-wrap: wrap; gap: 4px 20px; border-bottom: 1px solid var(--line); display: flex; }
  .bar a { padding: 9px 0; }
  .n { color: var(--ink-3); font-family: var(--mono); font-size: 11.5px; margin-left: 3px; }
  td:first-child { font-family: var(--mono); font-size: 12.5px; }
  .subject { white-space: normal; min-width: 280px; font-family: var(--font); }
  .type { margin-right: 6px; }
  tr.today td { background: color-mix(in srgb, var(--accent) 6%, transparent); }
  .small { font-size: 12.5px; }
  @media (max-width: 640px) { .wide-only { display: none; } .subject { min-width: 200px; } }
</style>
