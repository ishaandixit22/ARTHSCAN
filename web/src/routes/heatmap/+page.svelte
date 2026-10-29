<script lang="ts">
  import { goto } from "$app/navigation";
  import { BRAND } from "$lib/brand";
  import LiveStamp from "$lib/components/LiveStamp.svelte";
  import Treemap, { type TreemapGroup } from "$lib/components/Treemap.svelte";
  import { crore, date, pct } from "$lib/format";
  import { live, watch } from "$lib/live.svelte";
  import { useLiveMarket } from "$lib/liveMarket.svelte";

  let { data } = $props();
  type Stock = { symbol: string; name: string; sector: string; change: number; turnover: number; close: number };
  type Sector = { sector: string; turnover: number; change: number; avg_change: number; count: number; advances: number; declines: number; stocks?: Stock[] };

  const VIEWS = [
    ["nifty50", "Nifty 50"], ["niftynext50", "Nifty Next 50"], ["nifty100", "Nifty 100"],
    ["midcap150", "Midcap 150"], ["smallcap250", "Smallcap 250"], ["sectors", "All sectors"],
  ] as const;
  // Colour saturates at a move that's large for the period.
  const SCALE: Record<string, number> = { "1d": 3, "1w": 6, "1m": 10, "3m": 20, "1y": 40 };

  // The 1D view recolours from live prices for accounts with live access.
  const stockView = $derived(data.view !== "sectors");
  const liveDay = $derived(!!data.live && data.period === "1d" && stockView);
  const symbols = $derived(((data.map.sectors ?? []) as Sector[]).flatMap((g) => (g.stocks ?? []).map((s) => s.symbol)));
  $effect(() => (liveDay ? watch(symbols) : undefined));
  $effect(() => (liveDay ? useLiveMarket() : undefined));
  const sectors = $derived.by((): Sector[] => {
    const raw = (data.map.sectors ?? []) as Sector[];
    if (!liveDay) return raw;
    return raw.map((g) => {
      const stocks = (g.stocks ?? []).map((s) => ({ ...s, change: live.quotes[s.symbol]?.changePct ?? s.change }));
      return { ...g, stocks, avg_change: stocks.reduce((a, s) => a + s.change, 0) / Math.max(1, stocks.length) };
    });
  });

  const equal = $derived(data.size === "equal");
  const groupChange = (g: Sector) => (equal ? g.avg_change : g.change);
  const href = (p: Record<string, string | null>) => {
    const q = new URLSearchParams({ ...(data.view !== "nifty50" && data.view !== "sector" && { view: data.view }), ...(data.sector && { sector: data.sector }), ...(data.period !== "1d" && { period: data.period }), ...(data.size !== "equal" && { size: data.size }) });
    for (const [k, v] of Object.entries(p)) (v ? q.set(k, v) : q.delete(k));
    return q.size ? `?${q}` : "?";
  };

  // "Other" is stocks NSE doesn't classify; it would swamp the sector map, so it's counted, not drawn.
  const unclassified = $derived(stockView ? null : sectors.find((g) => g.sector === "Other") ?? null);
  const classified = $derived(stockView ? sectors : sectors.filter((g) => g.sector !== "Other"));

  // The one map on screen.
  const groups = $derived.by((): TreemapGroup[] => {
    if (!stockView) {
      // Equal: every sector the same size, so small sectors are as readable as big ones.
      return classified.map((g) => ({
        key: g.sector, label: g.sector, value: equal ? 1 : g.turnover, change: groupChange(g),
        sub: `${g.advances} up · ${g.declines} down`, href: href({ sector: g.sector, view: null }),
        title: `${g.sector}: ${pct(groupChange(g))} · ${g.count} stocks · ${g.advances} up, ${g.declines} down · click to open`,
      }));
    }
    return sectors.map((g) => ({
      key: g.sector, label: g.sector, value: equal ? (g.stocks?.length ?? 0) : g.turnover, change: groupChange(g),
      href: data.view === "sector" ? `/sectors/${encodeURIComponent(g.sector)}` : href({ sector: g.sector, view: null }),
      items: (g.stocks ?? []).map((s) => ({
        key: s.symbol, label: s.symbol, value: equal ? 1 : Math.max(s.turnover, 1), change: s.change, href: `/stock/${encodeURIComponent(s.symbol)}`,
        title: `${s.name} (${s.symbol}): ${pct(s.change)} · ₹${s.close?.toLocaleString("en-IN")} · turnover ${crore(s.turnover)}`,
      })),
    }));
  });

  const all = $derived(sectors.flatMap((g) => g.stocks ?? []));
  const up = $derived(stockView ? all.filter((s) => s.change > 0).length : classified.reduce((a, g) => a + g.advances, 0));
  const down = $derived(stockView ? all.filter((s) => s.change < 0).length : classified.reduce((a, g) => a + g.declines, 0));
  const avg = $derived(stockView && all.length ? all.reduce((a, s) => a + s.change, 0) / all.length : null);
  const risers = $derived(stockView ? [...all].sort((a, b) => b.change - a.change).slice(0, 5) : [...classified].sort((a, b) => groupChange(b) - groupChange(a)).slice(0, 5));
  const fallers = $derived(stockView ? [...all].sort((a, b) => a.change - b.change).slice(0, 5) : [...classified].sort((a, b) => groupChange(a) - groupChange(b)).slice(0, 5));
  const title = $derived(data.view === "sector" ? data.sector : (VIEWS.find(([k]) => k === data.view)?.[1] ?? "Heatmap"));
  let width = $state(1200);
  const height = $derived(width < 640 ? 760 : data.view === "smallcap250" || data.view === "midcap150" ? 720 : 620);
</script>

<svelte:window bind:innerWidth={width} />
<svelte:head><title>{title} heatmap — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>{title} heatmap</h1>
      <p class="sub">
        {#if data.view === "sectors"}Every sector, one tile each, coloured by its {data.period.toUpperCase()} move. Click a sector to open its stocks.
        {:else if data.view === "sector"}Every traded stock in {data.sector}, coloured by its {data.period.toUpperCase()} move. Click a stock to open it.
        {:else}The index's stocks grouped by sector, coloured by their {data.period.toUpperCase()} move. Click a sector name to open that sector, or a stock to open it.{/if}
        {#if liveDay}{" "}<LiveStamp close="As of {date(data.map.as_of)}." />{:else}{" "}As of {date(data.map.as_of)}.{/if}
      </p>
    </div>
  </div>

  <!-- Choose the map -->
  <div class="controls">
    <nav class="tabs views" aria-label="Heatmap">
      {#each VIEWS as [k, label]}
        <a href={href({ view: k === "nifty50" ? null : k, sector: null })} class:active={data.view === k} data-sveltekit-noscroll>{label}</a>
      {/each}
    </nav>
    <div class="right">
      <select aria-label="Open one sector" onchange={(e) => e.currentTarget.value && goto(href({ sector: e.currentTarget.value, view: null }), { noScroll: true })}>
        <option value="">{data.view === "sector" ? data.sector : "Open a sector…"}</option>
        {#each data.sectorList as name}{#if name !== data.sector}<option value={name}>{name}</option>{/if}{/each}
      </select>
      <nav class="tabs" aria-label="Period">
        {#each data.periods as p}<a href={href({ period: p === "1d" ? null : p })} class:active={p === data.period} data-sveltekit-noscroll>{p.toUpperCase()}</a>{/each}
      </nav>
      <nav class="tabs" aria-label="Tile size">
        <a href={href({ size: null })} class:active={equal} data-sveltekit-noscroll title="Every stock the same size">Equal</a>
        <a href={href({ size: "turnover" })} class:active={!equal} data-sveltekit-noscroll title="Sized by the day's trading value">Turnover</a>
      </nav>
    </div>
  </div>

  <!-- What the map says, in one line -->
  <div class="summary">
    <span><b class="up">{up}</b> up · <b class="down">{down}</b> down{#if avg != null}{" "}· average <b class={avg >= 0 ? "up" : "down"}>{pct(avg)}</b>{/if}</span>
    {#if data.view === "sector"}
      <a class="btn small" href="/sectors/{encodeURIComponent(data.sector)}">Analyse {data.sector} →</a>
    {:else if data.view !== "sectors"}
      <span class="sub">{data.map.stocks} stocks</span>
    {:else if unclassified}
      <span class="sub">{classified.length} sectors · {unclassified.count} stocks without a sector aren't shown</span>
    {/if}
  </div>

  <section class="card mapcard">
    {#if groups.length}
      <Treemap {groups} {height} scale={SCALE[data.period]} label="{title} heatmap" />
    {:else}
      <div class="empty">No stocks to show for this view.</div>
    {/if}
    <div class="legend" aria-hidden="true">
      <span class="down">−{SCALE[data.period]}%</span>
      <span class="ramp"></span>
      <span class="up">+{SCALE[data.period]}%</span>
      <span class="sub">{equal ? (stockView ? "Every stock the same size" : "Every sector the same size") : "Tile size = trading value"}</span>
    </div>
  </section>

  <div class="grid grid-2">
    {#each [["Rising most", risers], ["Falling most", fallers]] as [heading, list] (heading)}
      <section class="card">
        <div class="card-head"><h2>{heading}</h2><span class="sub">{stockView ? "stocks in this view" : "sectors"}</span></div>
        <ol class="movers">
          {#each list as any[] as m (m.symbol ?? m.sector)}
            {#if stockView}
              <li><a href="/stock/{encodeURIComponent(m.symbol)}" class="sym">{m.symbol}</a><span class="name">{m.name}</span><b class="mono {m.change >= 0 ? 'up' : 'down'}">{pct(m.change)}</b></li>
            {:else}
              <li><a href={href({ sector: m.sector, view: null })} class="sym">{m.sector}</a><span class="name">{m.count} stocks</span><b class="mono {groupChange(m) >= 0 ? 'up' : 'down'}">{pct(groupChange(m))}</b></li>
            {/if}
          {/each}
        </ol>
      </section>
    {/each}
  </div>
  <p class="sub small">Index members come from NSE's constituent lists; sectors from NSE's industry classification. Sector change is the average of its stocks{equal ? "" : ", weighted by trading value"}. Market capitalisation isn't available for every stock yet, so tiles are equal or sized by trading value.</p>
</div>

<style>
  .controls { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px 24px; align-items: center; border-bottom: 1px solid var(--line); padding-bottom: 2px; }
  .views { flex-wrap: wrap; gap: 4px 22px; }
  .views a { padding: 9px 0; font-size: 14px; }
  .right { display: flex; flex-wrap: wrap; gap: 10px 22px; align-items: center; }
  .right select { min-width: 190px; }
  .summary { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; font-size: 14px; color: var(--ink-2); }
  .summary b { font-family: var(--mono); font-weight: 500; }
  .mapcard { padding: 10px; }
  .legend { display: flex; align-items: center; gap: 10px; padding: 10px 4px 2px; font: 12px var(--mono); }
  .ramp { width: 160px; height: 8px; border-radius: 4px; background: linear-gradient(90deg, color-mix(in srgb, var(--down) 60%, var(--panel)), var(--panel-2), color-mix(in srgb, var(--up) 60%, var(--panel))); }
  .legend .sub { font-family: var(--font); margin-left: auto; }
  .movers { list-style: none; margin: 0; padding: 4px 0; }
  .movers li { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: baseline; padding: 9px 18px; border-bottom: 1px solid var(--line); }
  .movers li:last-child { border-bottom: 0; }
  .movers .name { max-width: none; }
  .movers b { font-weight: 500; font-size: 13px; }
  .small { font-size: 12.5px; }
  @media (max-width: 640px) { .right select { min-width: 0; flex: 1; } .legend .sub { display: none; } }
</style>
