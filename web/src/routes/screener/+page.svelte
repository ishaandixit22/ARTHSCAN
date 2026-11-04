<script lang="ts">
  import { BRAND } from "$lib/brand";
  import { int } from "$lib/format";

  let { data } = $props();

  let query = $state("");
  let direction = $state("");
  let universe = $state("");
  let sub = $state("");

  const tab = $derived(data.tab);
  const inTab = $derived(data.screens.filter((s: any) => s.segment === tab));
  const counts = $derived({
    fundamental: data.screens.filter((s: any) => s.segment === "fundamental").length,
    technical: data.screens.filter((s: any) => s.segment === "technical").length,
  });

  const words = $derived(query.trim().toLowerCase().split(/\s+/).filter(Boolean));
  const matches = (s: any) =>
    (!sub || s.subsegment === sub) && (!direction || s.direction === direction) && (!universe || s.universe === universe) &&
    words.every((w) => `${s.name} ${s.description} ${s.subsegment}`.toLowerCase().includes(w));
  const shown = $derived(inTab.filter(matches));

  // Subsegments in catalogue order, under the group they belong to.
  const groups = $derived.by(() => {
    const out: { group: string | null; subs: { name: string; screens: any[] }[] }[] = [];
    for (const s of shown) {
      let g = out.find((x) => x.group === s.group);
      if (!g) out.push((g = { group: s.group, subs: [] }));
      let b = g.subs.find((x) => x.name === s.subsegment);
      if (!b) g.subs.push((b = { name: s.subsegment, screens: [] }));
      b.screens.push(s);
    }
    return out;
  });
  const allSubs = $derived([...new Set(inTab.map((s: any) => s.subsegment))] as string[]);

  const UNIVERSE: Record<string, string> = { all: "All stocks", fno: "F&O stocks", nifty50: "Nifty 50", nifty500: "Nifty 500" };
  const RUNS: Record<string, string> = { weekly: "Weekly", live: "Live on click", intraday: "About every 5 min" };
  const clear = () => { query = ""; direction = ""; universe = ""; sub = ""; };
  const filtered = $derived(!!(query || direction || universe || sub));
</script>

<svelte:head>
  <title>Stock screener: 180 prebuilt screens — {BRAND}</title>
  <meta name="description" content="Prebuilt fundamental and technical stock screens for NSE. Fundamental screens refresh weekly; technical screens run on current prices when you open them." />
</svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>Screener</h1>
      <p class="sub">{data.screens.length} prebuilt screens with their rules in plain view. Or <a href="/screener/custom">build your own</a>.</p>
    </div>
  </div>

  <nav class="tabs" aria-label="Screen type">
    <a href="/screener" class:on={tab === "fundamental"} data-sveltekit-noscroll onclick={clear}>Fundamental <span>{counts.fundamental}</span></a>
    <a href="/screener?tab=technical" class:on={tab === "technical"} data-sveltekit-noscroll onclick={clear}>Technical <span>{counts.technical}</span></a>
  </nav>
  <p class="sub lead">
    {#if tab === "fundamental"}
      Company figures from quarterly and annual statements. Refreshed weekly, because statements change only a few times a year.
    {:else}
      Chart patterns and indicators. Daily-chart screens run when you open them, on live prices during market hours. Intraday screens refresh about every 5 minutes.
    {/if}
  </p>

  <div class="tools">
    <input type="search" bind:value={query} placeholder="Search screens: RSI, dividend, breakout…" aria-label="Search screens" />
    <select bind:value={sub} aria-label="Subsegment">
      <option value="">All subsegments</option>
      {#each allSubs as s}<option value={s}>{s}</option>{/each}
    </select>
    {#if tab === "technical"}
      <select bind:value={direction} aria-label="Direction">
        <option value="">Any direction</option>
        <option value="bullish">Bullish</option>
        <option value="bearish">Bearish</option>
        <option value="neutral">Neutral</option>
      </select>
      <select bind:value={universe} aria-label="Stocks covered">
        <option value="">Any coverage</option>
        {#each Object.entries(UNIVERSE) as [k, v]}<option value={k}>{v}</option>{/each}
      </select>
    {/if}
    {#if filtered}<button class="btn small" onclick={clear}>Clear</button>{/if}
  </div>

  {#each groups as g}
    {#if g.group}<h2 class="group">{g.group}</h2>{/if}
    {#each g.subs as b}
      <section class="card">
        <div class="card-head"><h3>{b.name}</h3><span class="sub">{b.screens.length}</span></div>
        <ul class="list">
          {#each b.screens as s (s.slug)}
            <li>
              <a href="/screener/{s.slug}">
                <span class="title">{s.name}</span>
                <span class="desc">{s.description}</span>
                <span class="meta">
                  <span>{RUNS[s.kind]}</span>
                  {#if s.timeframe}<span>{s.timeframe}</span>{/if}
                  {#if s.universe !== "all"}<span>{UNIVERSE[s.universe]}</span>{/if}
                  {#if s.direction && s.direction !== "neutral"}<span class={s.direction === "bullish" ? "up" : "down"}>{s.direction === "bullish" ? "Bullish" : "Bearish"}</span>{/if}
                  {#if s.total != null}<span>{int(s.total)} {s.total === 1 ? "stock" : "stocks"}</span>{/if}
                </span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {:else}
    <div class="card card-body empty">No screens match. <button class="link" onclick={clear}>Clear the filters</button></div>
  {/each}

  <p class="sub foot">Screens list stocks that meet a set of rules. They aren't recommendations or investment advice.</p>
</div>

<style>
  .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); }
  .tabs a { padding: 10px 14px; font-weight: 600; color: var(--ink-2); text-decoration: none; border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .tabs a span { font-weight: 400; color: var(--ink-3); margin-left: 4px; }
  .tabs a.on { color: var(--ink); border-bottom-color: var(--brand); }
  .lead { max-width: 70ch; }
  .tools { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .tools input { flex: 1 1 260px; min-width: 0; }
  .tools select { flex: 0 1 auto; max-width: 100%; }
  .group { margin: 8px 0 -4px; font-size: 18px; }
  h3 { margin: 0; font-size: 15px; }
  .list { list-style: none; margin: 0; padding: 0; }
  .list li + li { border-top: 1px solid var(--line); }
  .list a { display: grid; gap: 3px; padding: 12px 16px; color: inherit; text-decoration: none; }
  .list a:hover { background: var(--panel-2); }
  .title { font-weight: 600; color: var(--ink); }
  .desc { font-size: 13.5px; color: var(--ink-2); }
  .meta { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12.5px; color: var(--ink-3); }
  .empty { text-align: center; color: var(--ink-2); }
  .link { border: 0; background: none; padding: 0; font: inherit; color: var(--brand); cursor: pointer; text-decoration: underline; }
  .foot { font-size: 12.5px; }
</style>
