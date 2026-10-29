<script lang="ts">
  import SectorMatrix, { type MatrixSector } from "$lib/components/SectorMatrix.svelte";
  import { date } from "$lib/format";

  type Lens = { key: string; label: string; x: string; y: string; xShort: string; yShort: string; xMath: string; yMath: string; quadrants: Record<"tr" | "br" | "bl" | "tl", string> };
  type Matrix = { as_of: string | null; lens: Lens; benchmark: { key: string; name: string }; timeframe: "weekly" | "daily"; period: string; size_by: string;
    sectors: MatrixSector[]; skipped: string[]; counts: Record<"tr" | "br" | "bl" | "tl", number>; markdown: string };
  let { matrix, params, notice }: { matrix: Matrix; params: { lens: string; bm: string; tf: string; size: string }; notice: string | null } = $props();

  const LENSES = [["classic", "Classic"], ["trend", "Trend quality"], ["risk", "Risk-adjusted"], ["volume", "Volume"]] as const;
  const SIZES = [["uniform", "Uniform"], ["rvol", "Relative volume"], ["volatility", "Volatility (ATR %)"], ["velocity", "Tail velocity"]] as const;
  const GROUPS = ["tr", "br", "bl", "tl"] as const;
  const COLOUR = { tr: "var(--up)", br: "var(--warn)", bl: "var(--down)", tl: "var(--brand-2)" } as const;

  const href = (p: Record<string, string>) => {
    const q = new URLSearchParams({ lens: params.lens, bm: params.bm, tf: params.tf, size: params.size, ...p });
    for (const [k, v] of [...q]) if ((k === "lens" && v === "classic") || (k === "bm" && v === "nifty50") || (k === "tf" && v === "weekly") || (k === "size" && v === "uniform")) q.delete(k);
    return q.size ? `?${q}` : "?";
  };

  // Which sectors are shown, the search box, tails and the sector under the pointer.
  let hidden = $state(new Set<string>());
  let search = $state("");
  let allTails = $state(false);
  let hoverKey = $state<string | null>(null);
  let pinned = $state<string | null>(null);
  let info = $state(false);
  let mcp = $state(false);
  let copied = $state("");

  const matches = (s: MatrixSector) => s.name.toLowerCase().includes(search.trim().toLowerCase());
  const visible = $derived(new Set(matrix.sectors.filter((s) => !hidden.has(s.key)).map((s) => s.key)));
  const listed = $derived(matrix.sectors.filter(matches));
  const toggle = (k: string) => { const n = new Set(hidden); n.has(k) ? n.delete(k) : n.add(k); hidden = n; };
  const setAll = (on: boolean) => (hidden = on ? new Set() : new Set(matrix.sectors.map((s) => s.key)));

  const qs = $derived(new URLSearchParams({ lens: matrix.lens.key, benchmark: matrix.benchmark.key, timeframe: matrix.timeframe, size: params.size }).toString());
  const mdHref = $derived(`/sectors.md?${new URLSearchParams({ lens: matrix.lens.key, bm: matrix.benchmark.key, tf: matrix.timeframe, size: params.size })}`);
  const mcpCall = $derived(JSON.stringify({ name: "get_sector_matrix", arguments: { lens: matrix.lens.key, benchmark: matrix.benchmark.key, timeframe: matrix.timeframe, size: params.size } }, null, 2));
  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = what;
      setTimeout(() => (copied = ""), 1800);
    } catch { /* clipboard blocked: the link beside it still works */ }
  }
  const fmt = (v: number) => v.toFixed(2);
</script>

<section class="map card">
  <div class="top">
    <div class="titles">
      <h2>Sector rotation map</h2>
      <p class="sub">
        <span>Updated <b>{matrix.as_of ? date(matrix.as_of) : "—"}</b></span> ·
        <button type="button" class="link" onclick={() => copy(matrix.markdown, "md")}>{copied === "md" ? "Copied ✓" : "Copy as Markdown"}</button> ·
        <a href={mdHref} target="_blank" rel="noopener">View as Markdown</a> ·
        <button type="button" class="link" onclick={() => (mcp = !mcp)} aria-expanded={mcp}>MCP</button>
      </p>
    </div>
    <div class="toggles">
      <nav class="seg" aria-label="Timeframe">
        <a href={href({ tf: "weekly" })} class:on={matrix.timeframe === "weekly"} data-sveltekit-noscroll>Weekly</a>
        <a href={href({ tf: "daily" })} class:on={matrix.timeframe === "daily"} data-sveltekit-noscroll>Daily</a>
      </nav>
      <nav class="seg" aria-label="Benchmark">
        <a href={href({ bm: "nifty500" })} class:on={matrix.benchmark.key === "nifty500"} data-sveltekit-noscroll>vs Nifty 500</a>
        <a href={href({ bm: "nifty50" })} class:on={matrix.benchmark.key === "nifty50"} data-sveltekit-noscroll>vs Nifty 50</a>
      </nav>
      <label class="switch"><input type="checkbox" bind:checked={allTails} /><span>All tails</span></label>
    </div>
  </div>

  {#if mcp}
    <div class="mcp">
      <p class="sub">Ask an AI assistant connected to Arthscan's MCP server for this exact view, or call the REST endpoint:</p>
      <pre>{mcpCall}</pre>
      <pre>GET /v1/market/sector-matrix?{qs}</pre>
      <button type="button" class="btn small" onclick={() => copy(mcpCall, "mcp")}>{copied === "mcp" ? "Copied ✓" : "Copy tool call"}</button>
      <a class="btn small" href="/developers">Connect an assistant</a>
    </div>
  {/if}

  <div class="lensbar">
    <nav class="lenses" aria-label="Matrix lens">
      {#each LENSES as [k, label]}
        <a href={href({ lens: k })} class:on={matrix.lens.key === k} data-sveltekit-noscroll>{label}</a>
      {/each}
    </nav>
    <button type="button" class="help" onclick={() => (info = !info)} aria-expanded={info} aria-label="What do the axes mean?">?</button>
    <label class="sizeby">Bubble size
      <select onchange={(e) => (location.href = href({ size: e.currentTarget.value }))} aria-label="Bubble size">
        {#each SIZES as [k, label]}<option value={k} selected={params.size === k}>{label}</option>{/each}
      </select>
    </label>
  </div>
  {#if info}
    <div class="info" role="note">
      <p><b>{matrix.lens.x}</b> (horizontal): {matrix.lens.xMath}</p>
      <p><b>{matrix.lens.y}</b> (vertical): {matrix.lens.yMath}</p>
      <p class="sub">Both axes are scaled so 100 is typical and each 2 points is one standard deviation; the crosshair sits at (100, 100).</p>
    </div>
  {/if}
  {#if notice}<div class="notice">{notice}</div>{/if}

  {#if matrix.sectors.length}
    <div class="body">
      <div class="chart">
        <SectorMatrix sectors={matrix.sectors} quadrantNames={matrix.lens.quadrants} xLabel={matrix.lens.x} yLabel={matrix.lens.y}
          {visible} bind:hoverKey bind:pinned {allTails} sized={params.size !== "uniform"} period={matrix.period} />
        <p class="sub foot">Tails trace the last 8 {matrix.period}s. Point at a sector, or click it to keep its path on screen.{matrix.skipped.length ? ` No data yet for ${matrix.skipped.length} sector${matrix.skipped.length > 1 ? "s" : ""}.` : ""}</p>
      </div>

      <aside class="side" aria-label="Sectors">
        <div class="sidehead">
          <div><b>Sectors</b> <span class="sub">{visible.size} of {matrix.sectors.length} shown</span></div>
          <div class="allnone"><button type="button" onclick={() => setAll(true)} class:on={hidden.size === 0}>All</button><button type="button" onclick={() => setAll(false)} class:on={hidden.size === matrix.sectors.length}>None</button></div>
        </div>
        <input class="find" type="search" placeholder="Find a sector" bind:value={search} aria-label="Find a sector" />
        <div class="cols"><span>Sector</span><span title={matrix.lens.xMath}>{matrix.lens.xShort}</span><span title={matrix.lens.yMath}>{matrix.lens.yShort}</span></div>
        <div class="list">
          {#each GROUPS as q (q)}
            {@const rows = listed.filter((s) => s.quadrant === q).sort((a, b) => b.x - a.x)}
            {#if rows.length}
              <div class="group"><i style="background: {COLOUR[q]}"></i>{matrix.lens.quadrants[q]} · {matrix.counts[q]}</div>
              {#each rows as s (s.key)}
                <label class="row" class:hl={hoverKey === s.key || pinned === s.key} onpointerenter={() => (hoverKey = s.key)} onpointerleave={() => (hoverKey = null)}>
                  <input type="checkbox" checked={!hidden.has(s.key)} onchange={() => toggle(s.key)} />
                  <span class="nm">{s.name}</span><span class="n">{fmt(s.x)}</span><span class="n">{fmt(s.y)}</span>
                </label>
              {/each}
            {/if}
          {/each}
          {#if !listed.length}<p class="sub empty">No sector matches "{search}".</p>{/if}
        </div>
      </aside>
    </div>
  {:else}
    <div class="empty">The map needs more index history than is stored for this view ({matrix.timeframe}, {matrix.lens.label.toLowerCase()}). Try the daily view.</div>
  {/if}
</section>

<style>
  .map { padding: 0; overflow: hidden; }
  .top { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px 24px; padding: 16px 18px 10px; }
  .titles h2 { font-size: 20px; }
  .titles .sub { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; }
  .titles b { color: var(--ink); font-weight: 500; }
  .link { background: none; border: 0; padding: 0; color: var(--brand-2); font: inherit; cursor: pointer; }
  .link:hover, .titles a:hover { text-decoration: underline; }
  .titles a { color: var(--brand-2); }
  .toggles { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; }
  .seg { display: inline-flex; border: 1px solid var(--line-2); border-radius: 8px; overflow: hidden; }
  .seg a { padding: 6px 12px; font-size: 13px; color: var(--ink-2); }
  .seg a.on { background: var(--panel-2); color: var(--ink); font-weight: 600; }
  .seg a + a { border-left: 1px solid var(--line-2); }
  .switch { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink-2); cursor: pointer; }
  .switch input { appearance: none; width: 34px; height: 20px; border-radius: 999px; background: var(--line-2); position: relative; padding: 0; border: 0; cursor: pointer; transition: background 0.15s; }
  .switch input::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--panel); transition: transform 0.15s var(--ease); }
  .switch input:checked { background: var(--accent); }
  .switch input:checked::after { transform: translateX(14px); }

  .mcp { margin: 0 18px 10px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 6px; display: grid; gap: 8px; justify-items: start; }
  .mcp pre { margin: 0; width: 100%; font-size: 12px; }

  .lensbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; padding: 4px 18px 12px; border-bottom: 1px solid var(--line); }
  .lenses { display: flex; flex-wrap: wrap; gap: 4px 22px; }
  .lenses a { position: relative; padding: 8px 0; font-size: 14px; color: var(--ink-3); }
  .lenses a:hover { color: var(--ink); }
  .lenses a.on { color: var(--ink); font-weight: 500; }
  .lenses a.on::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 1px; background: var(--accent); }
  .help { width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--line-2); background: none; color: var(--ink-3); font: 600 12px var(--font); cursor: pointer; padding: 0; }
  .help:hover, .help[aria-expanded="true"] { color: var(--ink); border-color: var(--accent); }
  .sizeby { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink-3); }
  .sizeby select { height: 30px; font-size: 13px; }
  .info { margin: 10px 18px 0; padding: 12px 14px; background: var(--panel-2); border-radius: 6px; display: grid; gap: 6px; font-size: 13.5px; line-height: 1.55; }
  .notice { margin: 10px 18px 0; }

  .body { display: grid; grid-template-columns: minmax(0, 1fr) 300px; }
  .chart { padding: 8px 8px 12px; min-width: 0; }
  .foot { padding: 4px 12px 0; font-size: 12.5px; }
  .side { border-left: 1px solid var(--line); display: flex; flex-direction: column; max-height: 640px; }
  .sidehead { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px 8px; }
  .sidehead .sub { font-size: 12px; }
  .allnone { display: inline-flex; border: 1px solid var(--line-2); border-radius: 6px; overflow: hidden; }
  .allnone button { background: none; border: 0; padding: 4px 10px; font-size: 12px; color: var(--ink-2); cursor: pointer; }
  .allnone button.on { background: var(--panel-2); color: var(--ink); font-weight: 600; }
  .find { margin: 0 14px 8px; width: calc(100% - 28px); }
  .cols { display: grid; grid-template-columns: 1fr 54px 54px; gap: 6px; padding: 6px 14px; font-size: 12px; color: var(--ink-3); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .cols span:not(:first-child) { text-align: right; cursor: help; }
  .list { overflow-y: auto; flex: 1; }
  .group { display: flex; align-items: center; gap: 8px; padding: 10px 14px 4px; font-size: 12.5px; font-weight: 600; color: var(--ink-2); }
  .group i { width: 8px; height: 8px; border-radius: 50%; }
  .row { display: grid; grid-template-columns: 18px 1fr 54px 54px; gap: 6px; align-items: center; padding: 5px 14px; font-size: 13px; cursor: pointer; }
  .row:hover, .row.hl { background: var(--panel-2); }
  .row input { width: 15px; height: 15px; padding: 0; accent-color: var(--accent); }
  .row .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row .n { text-align: right; font: 12.5px var(--mono); }
  .empty { padding: 20px 14px; }
  @media (max-width: 900px) {
    .body { grid-template-columns: 1fr; }
    .side { border-left: 0; border-top: 1px solid var(--line); max-height: 420px; }
    .sizeby { margin-left: 0; }
  }
</style>
