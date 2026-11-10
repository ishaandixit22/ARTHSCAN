<script lang="ts">
  import StockTable from "$lib/components/StockTable.svelte";
  import CityTiles from "$lib/components/CityTiles.svelte";
  import Search from "$lib/components/Search.svelte";
  import { BRAND } from "$lib/brand";
  import { indexHref, indexShort as indexLabel } from "$lib/indices";
  import LiveStamp from "$lib/components/LiveStamp.svelte";
  import { banWhen, cr, crSigned, crore, date, int, pct, tone } from "$lib/format";
  import { live, watch } from "$lib/live.svelte";
  import { market, useLiveMarket, type LiveStock } from "$lib/liveMarket.svelte";
  import { reveal } from "$lib/reveal";
  import { viewport } from "$lib/viewport.svelte";
  import { onMount, type Component } from "svelte";

  let { data } = $props();
  // Accounts with live access see breadth and movers from live prices; everyone else the last close.
  $effect(() => (data.live ? useLiveMarket() : undefined));
  const lm = $derived(data.live ? market.data : null);
  const asRows = (xs: LiveStock[]) =>
    xs.slice(0, 8).map((s) => ({ symbol: s.symbol, name: s.name, close: s.ltp, change_pct: s.change_pct, turnover: s.turnover }));
  const b = $derived(lm ? lm.breadth : (data.summary.breadth ?? {}));
  const fii = $derived(data.summary.fii_dii.find((f: any) => f.category === "FII"));
  const dii = $derived(data.summary.fii_dii.find((f: any) => f.category === "DII"));
  const adv = $derived((b.advances ?? 0) / Math.max(1, (b.advances ?? 0) + (b.declines ?? 0)));
  const day = $derived(date(data.summary.breadth?.as_of).replace(/ \d{4}$/, ""));
  let tab = $state<"gainers" | "losers" | "active">("gainers");
  const movers = $derived(lm ? asRows(lm.movers[tab]) : tab === "gainers" ? data.gainers : tab === "losers" ? data.losers : data.active);
  const topUp = $derived((lm ? asRows(lm.movers.gainers) : data.gainers).slice(0, 5));
  const topDown = $derived((lm ? asRows(lm.movers.losers) : data.losers).slice(0, 5));
  const moveMax = $derived(Math.max(1, ...[...topUp, ...topDown].map((r: any) => Math.abs(r.change_pct ?? 0))));

  // During the session each sector's move is the live median of its stocks; otherwise the close's average.
  const liveSector = $derived(new Map((lm?.sectors ?? []).map((s) => [s.sector, s.median_change])));
  const sectorMove = (s: any): number | null => (lm ? (liveSector.get(s.sector) ?? null) : s.avg_change_pct);
  const sectors = $derived(data.sectors.slice(0, 10));
  const sectorMax = $derived(Math.max(0.5, ...sectors.map((s: any) => Math.abs(sectorMove(s) ?? 0))));
  const ranked = $derived([...data.sectors].filter((s: any) => sectorMove(s) != null && s.stocks >= 5).sort((a: any, z: any) => sectorMove(z)! - sectorMove(a)!));

  // Index levels from Dhan while the market is open, NSE's closes otherwise.
  const indices = $derived(data.indices.map((i) => {
    const q = lm?.indices.find((x) => x.index_name === i.index_name);
    return q ? { ...i, close: q.ltp, change_pct: q.change_pct } : i;
  }));
  const indicesLive = $derived(!!lm?.indices.length);
  const nifty = $derived(indices.find((i) => i.index_name === "Nifty 50"));

  // The city keeps its layout (sector districts, footprint by the last close's turnover); live prices move the towers.
  // Keyed on a boolean: `lm` is a new object every poll, which would drop and resend the subscription each time.
  const isLive = $derived(!!lm);
  // The 3D city is the page's costliest code by far, so it arrives separately: straight away on a
  // desktop, and only on request on a phone, which shows the same market as plain tiles.
  let City = $state<Component<{ stocks: any[]; label: string }> | null>(null);
  let cityLoading = $state(false);
  async function loadCity() {
    if (City || cityLoading) return;
    cityLoading = true;
    City = (await import("$lib/components/MarketCity.svelte")).default as any;
    cityLoading = false;
  }
  onMount(() => { if (!viewport.compact) void loadCity(); });
  $effect(() => { if (!viewport.compact) void loadCity(); });
  $effect(() => (isLive && City ? watch(data.cityStocks.map((s) => s.symbol)) : undefined));
  const city = $derived(lm ? data.cityStocks.map((s) => {
    const q = live.quotes[s.symbol];
    return q?.changePct != null ? { ...s, change: q.changePct, close: q.ltp } : s;
  }) : data.cityStocks);
  const cityLive = $derived(!!lm && data.cityStocks.some((s) => live.quotes[s.symbol]));
  const cityUp = $derived(city.filter((s) => (s.change ?? 0) > 0).length);
  const cityDown = $derived(city.filter((s) => (s.change ?? 0) < 0).length);

  // The day's headline, written from the data: who won the day, which sectors led and lagged.
  const headline = $derived.by(() => {
    const a = b.advances ?? 0, d = b.declines ?? 0;
    const lead = a > d * 1.15 ? "Buyers outnumbered sellers" : d > a * 1.15 ? "Sellers outnumbered buyers" : "Risers and fallers ran close";
    const top = ranked[0]?.sector, bottom = ranked[ranked.length - 1]?.sector;
    return top && bottom && top !== bottom ? `${lead}; ${cap(short(top))} led, ${short(bottom)} lagged.` : `${lead}.`;
  });
  const SHORT: Record<string, string> = {
    "Automobile and Auto Components": "autos", "Fast Moving Consumer Goods": "FMCG", "Information Technology": "IT",
    "Financial Services": "finance", "Media Entertainment & Publication": "media", "Oil Gas & Consumable Fuels": "oil and gas",
    "Metals & Mining": "metals", "Construction Materials": "cement", "Consumer Durables": "durables", "Consumer Services": "consumer services",
    "Telecommunication": "telecom", "Capital Goods": "capital goods", "Forest Materials": "paper and wood",
  };
  const cap = (w: string) => (w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1));
  const short = (sector: string) => SHORT[sector] ?? sector.toLowerCase();

  // Five ideas a first-time investor needs to read this site, each tied to the page that shows it.
  const IDEAS = [
    { term: "Breadth", plain: "Count how many stocks rose and how many fell. An index can rise on a few giants while most stocks fall; breadth tells you which kind of day it was.", href: "/breadth", cta: "See today's breadth" },
    { term: "Sectors", plain: "Companies in the same business tend to move together. Money rotates between sectors, and spotting the rotation early is half of investing.", href: "/sectors", cta: "Watch sector rotation" },
    { term: "P/E ratio", plain: "Price divided by earnings: how many years of today's profit you pay for. Compare a stock's P/E with its own past and its peers, never in isolation.", href: "/valuations", cta: "Is the market cheap?" },
    { term: "FII & DII flows", plain: "Foreign (FII) and Indian (DII) institutions move the biggest money. When both buy, the market usually has a tailwind.", href: "/fii-dii", cta: "Follow the money" },
    { term: "Screening", plain: "Instead of chasing tips, set rules (growing profits, low debt, fair price) and let the screener find every stock that passes.", href: "/screener", cta: "Build your first screen" },
  ];
  // Tells search engines the site's name, including the spelling people type.
  const siteLd = `<script type="application/ld+json">${JSON.stringify([
    { "@context": "https://schema.org", "@type": "WebSite", name: BRAND, alternateName: ["ArthScan", "arthscan.me"], url: "https://arthscan.me/" },
    { "@context": "https://schema.org", "@type": "Organization", name: BRAND, url: "https://arthscan.me/", logo: "https://arthscan.me/icon-512.png" },
  ])}<\/script>`;
</script>

<svelte:head>
  <title>{BRAND} — the Indian stock market, explained as it moves</title>
  {@html siteLd}
</svelte:head>

<div class="front">
  {#if data.indices.length}
    <section class="indices" style="--n: {indices.length}" aria-label={indicesLive ? "Index levels" : "Index closes"}>
      {#each indices as i (i.index_name)}
        <a href={indexHref(i.index_name)}>
          <span class="iname">{indexLabel(i.index_name)}</span>
          <span class="iv">
            <b>{i.close?.toLocaleString("en-IN", { maximumFractionDigits: 2 }) ?? "—"}</b>
            <span class={tone(i.change_pct)}>{pct(i.change_pct)}</span>
          </span>
        </a>
      {/each}
      <span class="dateline asof">{#if indicesLive}<LiveStamp close="" />{:else}NSE close · {date(data.indicesAsOf).replace(/ \d{4}$/, "")}{/if}</span>
    </section>
  {/if}

  <section class="page1">
    <div class="lead">
      <p class="dateline"><LiveStamp close="NSE close · {date(data.summary.breadth?.as_of)}" /></p>
      <h1>{headline}</h1>
      <p class="standfirst">
        {#if nifty?.close}The Nifty 50 {indicesLive ? "is at" : "closed at"} {nifty.close.toLocaleString("en-IN", { maximumFractionDigits: 2 })}, <span class={tone(nifty.change_pct)}>{pct(nifty.change_pct)}</span>. {/if}
        Of {int(lm ? lm.stocks : b.stocks)} NSE stocks, <a class="up" href="/breadth?show=advances">{int(b.advances)} rose</a> and
        <a class="down" href="/breadth?show=declines">{int(b.declines)} fell</a>.
        {#if fii}Foreign institutions were net <a href="/fii-dii" class={tone(fii.net_value)}>{(fii.net_value ?? 0) >= 0 ? "buyers" : "sellers"} of {cr(Math.abs(fii.net_value ?? 0))}</a>{#if dii}, Indian institutions net <a href="/fii-dii" class={tone(dii.net_value)}>{(dii.net_value ?? 0) >= 0 ? "buyers" : "sellers"} of {cr(Math.abs(dii.net_value ?? 0))}</a>{/if}.{/if}
      </p>
      <div class="lookup">
        <Search lead placeholder="Look up a company: ITC, HDFC Bank…" />
        <a class="screen" href="/screener">Or browse 180 ready-made stock screens →</a>
      </div>
      <aside class="explainer">
        <b>What is breadth?</b>
        How many stocks rose against how many fell. When risers outnumber fallers, the move was broad, not just two or three giants carrying the index.
        <span class="bar" aria-hidden="true"><i style="width: {adv * 100}%"></i></span>
      </aside>
    </div>

    <figure class="scene">
      <figcaption class="caption-top">
        <h2>The Nifty 100 as a city</h2>
        <span class="desk-note">Height is the day's move; footprint is turnover. Drag to turn, tap a tower to open the stock.</span>
        <span class="phone-note">Each tile is a company, grouped by sector: green rose, red fell, deeper for a bigger move.</span>
      </figcaption>
      {#if data.cityStocks.length}
        {#if !City}
          <div class="phone-city">
            <CityTiles stocks={city} />
            <button type="button" class="btn open-3d" disabled={cityLoading} onclick={loadCity}>{cityLoading ? "Opening the city…" : "Open the 3D city"}</button>
          </div>
        {/if}
        <div class="plate" class:ready={!!City}>
          {#if City}
            <City stocks={city} label="The Nifty 100 as a 3D city: {cityUp} companies {cityLive ? "are up" : "rose"} and {cityDown} {cityLive ? "are down" : "fell"}{cityLive ? " right now" : ` on ${day}`}." />
          {/if}
        </div>
        <figcaption class="caption">
          <span><i class="sw up"></i>{cityUp} {cityLive ? "up" : "rose"}</span>
          <span><i class="sw down"></i>{cityDown} {cityLive ? "down" : "fell"}, sunk below the street</span>
          <span class="dateline">{#if cityLive}Nifty 100 · <LiveStamp close="" />{:else}Nifty 100 · NSE close {day}{/if}</span>
        </figcaption>
      {/if}
    </figure>

    <aside class="listings">
      <h2>Biggest moves</h2>
      <div class="mirror">
        {#each topUp as r (r.symbol)}
          <a class="mrow" href="/stock/{encodeURIComponent(r.symbol)}">
            <span class="sym">{r.symbol}</span>
            <span class="track up"><i style="width: {(Math.abs(r.change_pct ?? 0) / moveMax) * 100}%"></i></span>
            <span class="num up">{pct(r.change_pct)}</span>
          </a>
        {/each}
        <div class="axis" aria-hidden="true"><span>Gainers above</span><span>Losers below</span></div>
        {#each topDown as r (r.symbol)}
          <a class="mrow" href="/stock/{encodeURIComponent(r.symbol)}">
            <span class="sym">{r.symbol}</span>
            <span class="track down"><i style="width: {(Math.abs(r.change_pct ?? 0) / moveMax) * 100}%"></i></span>
            <span class="num down">{pct(r.change_pct)}</span>
          </a>
        {/each}
      </div>
      <h2 class="flows-h">Money flows</h2>
      <table class="flows">
        <tbody>
          <tr><td>Foreign (FII)</td><td class={tone(fii?.net_value)}>{crSigned(fii?.net_value)}</td></tr>
          <tr><td>Indian (DII)</td><td class={tone(dii?.net_value)}>{crSigned(dii?.net_value)}</td></tr>
        </tbody>
      </table>
      <p class="dateline">NSE provisional · {date(fii?.date)}</p>
    </aside>
  </section>

  <section class="pulse" use:reveal aria-label="Market pulse">
    <div class="grid grid-4">
      <div class="stat">
        <a class="label" href="/breadth">Advances / declines</a>
        <div class="value"><a class="up" href="/breadth?show=advances">{int(b.advances)}</a><span class="slash">/</span><a class="down" href="/breadth?show=declines">{int(b.declines)}</a></div>
        <p class="means">Stocks that closed higher against lower. More risers means a broad, healthy day.</p>
      </div>
      <div class="stat">
        <a class="label" href="/breadth?show=highs">52-week highs / lows</a>
        <div class="value"><a class="up" href="/breadth?show=highs">{int(b.at_52w_high)}</a><span class="slash">/</span><a class="down" href="/breadth?show=lows">{int(b.at_52w_low)}</a></div>
        <p class="means">Stocks at their best or worst price of the past year.</p>
      </div>
      <div class="stat">
        <span class="label">Total turnover</span>
        <div class="value">{cr(b.turnover_cr)}</div>
        <p class="means">The value of every share traded. Higher means a busier market.</p>
      </div>
      <a class="stat" href="/valuations">
        <span class="label">Nifty 50 P/E</span>
        <div class="value">{nifty?.pe != null ? nifty.pe.toFixed(1) : "—"}</div>
        <p class="means">What investors pay for each ₹1 of the index's yearly profit. Compare it with its own history.</p>
      </a>
    </div>
    <p class="ban">
      <a href="/fo-ban">F&amp;O ban {banWhen(data.foBan?.date)}</a>
      {#if data.foBan?.symbols.length}
        {#each data.foBan.symbols as s}<a class="sym" href="/stock/{s}">{s}</a>{/each}
      {:else}<span>none</span>{/if}
      <span class="why">Stocks whose futures positions crossed 95% of the limit; no new F&amp;O positions until they cool off.</span>
    </p>
  </section>

  <div class="boards">
    <section class="card" use:reveal>
      <div class="card-head">
        <h2>Today's movers</h2>
        <div class="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "gainers"} onclick={() => (tab = "gainers")}>Gainers</button>
          <button role="tab" aria-selected={tab === "losers"} onclick={() => (tab = "losers")}>Losers</button>
          <button role="tab" aria-selected={tab === "active"} onclick={() => (tab = "active")}>Most active</button>
        </div>
      </div>
      <StockTable rows={movers} cols={["close", "change_pct", "turnover"]} />
      <p class="foot">Stocks with at least ₹1 Cr turnover.</p>
    </section>

    <section class="card" use:reveal={120}>
      <div class="card-head"><h2>Sectors today</h2><a class="more" href="/sectors">All sectors →</a></div>
      <ul class="sectors">
        {#each sectors as s (s.sector)}
          {@const v = sectorMove(s) ?? 0}
          <li>
            <a href="/sectors/{encodeURIComponent(s.sector)}">
              <span class="sname">{s.sector}<small>{s.stocks} stocks · {crore(s.turnover)}</small></span>
              <span class="sbar" aria-hidden="true"><i class={tone(v)} style="width: {(Math.abs(v) / sectorMax) * 50}%; {v < 0 ? 'right: 50%' : 'left: 50%'}"></i></span>
              <span class="num {tone(v)}">{pct(v)}</span>
            </a>
          </li>
        {/each}
      </ul>
      <p class="foot">{lm ? "Median live change of each sector's stocks." : "Average day change of each sector's stocks."} One-month view on <a href="/sectors">sector rotation</a>.</p>
    </section>
  </div>

  <section class="learn" id="learn">
    <header class="learn-head" use:reveal>
      <h2>The beginner's page</h2>
      <p>Five ideas unlock everything on {BRAND}. Each one links to the page where you can watch it working on today's data.</p>
    </header>
    <div class="ideas">
      {#each IDEAS as idea, i}
        <article use:reveal={i * 70}>
          <h3>{idea.term}</h3>
          <p>{idea.plain}</p>
          <a href={idea.href}>{idea.cta} →</a>
        </article>
      {/each}
    </div>
  </section>
</div>

<style>
  .front { display: grid; gap: 40px; padding: 0 0 96px; }
  /* Below the fold: skip layout and paint until they come near the viewport. */
  .boards, .learn { content-visibility: auto; contain-intrinsic-size: auto 720px; }

  /* Index strip: the paper's market-data line under the masthead. */
  /* One row: an equal column per index (name over level and change), then the stamp. */
  .indices { display: grid; grid-template-columns: repeat(var(--n, 6), minmax(0, 1fr)) auto; align-items: end; padding: 9px 0; border-bottom: 1px solid var(--ink); font-stretch: 82%; }
  .indices a { display: grid; gap: 1px; min-width: 0; padding: 0 14px; border-left: 1px solid var(--line-2); font-size: 14px; color: var(--ink); }
  .indices a:first-child { padding-left: 0; border-left: 0; }
  .indices a:hover b { text-decoration: underline; text-underline-offset: 3px; }
  .iname { font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; font-size: 11.5px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .iv { display: flex; align-items: baseline; gap: 6px; white-space: nowrap; }
  .indices b { font-weight: 850; }
  .asof { padding-left: 14px; white-space: nowrap; }

  /* Page one: lead column, the city as the lead picture, listings. Column rules, no boxes. */
  .page1 { display: grid; grid-template-columns: minmax(0, 23fr) minmax(0, 55fr) minmax(0, 22fr); border-bottom: var(--rule-heavy); margin-top: -14px; }
  .page1 > * { padding: 18px 24px 24px; }
  .page1 > * + * { border-left: 1px solid var(--line-2); }
  .lead { padding-left: 0; display: flex; flex-direction: column; gap: 16px; }
  .lead h1 { font-size: clamp(36px, 3.6vw, 56px); line-height: 0.93; hyphens: auto; animation: set-in 0.9s var(--ease) both; }
  @keyframes set-in { from { clip-path: inset(0 0 100% 0); } to { clip-path: inset(0 0 -10% 0); } }
  .standfirst { font: 17px/1.5 var(--serif); color: var(--ink); }
  .standfirst a { font-weight: 600; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; }
  .lookup { display: grid; gap: 8px; margin-top: 4px; }
  .screen { font: 700 13.5px var(--font); font-stretch: 85%; color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
  .explainer { margin-top: auto; }
  .explainer .bar { display: block; margin-top: 12px; height: 6px; background: var(--down-rev); }
  .explainer .bar i { display: block; height: 100%; background: var(--up-rev); transition: width 0.8s var(--ease); }

  .scene { margin: 0; padding-left: 0 !important; padding-right: 0 !important; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-height: 640px; }
  .scene figcaption { padding: 0 24px; }
  .caption-top { display: grid; gap: 4px; padding-bottom: 12px !important; border-bottom: 1px solid var(--line-2); }
  .caption-top h2 { font-size: 15px; font-weight: 850; font-stretch: 72%; text-transform: uppercase; letter-spacing: 0.05em; }
  .caption-top span { font: 14px/1.4 var(--serif); color: var(--ink-2); }
  .plate { position: relative; min-height: 0; animation: develop 1.4s var(--ease) both 0.2s; }
  .phone-city, .phone-note { display: none; }
  @keyframes develop { from { opacity: 0; filter: contrast(0.4); } }
  .caption { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 18px; padding-top: 10px !important; border-top: 1px solid var(--line-2); font-size: 13px; font-weight: 600; font-stretch: 85%; }
  .caption span { display: inline-flex; align-items: center; gap: 6px; }
  .caption .dateline { margin-left: auto; }
  .sw { width: 10px; height: 10px; }
  .sw.up { background: var(--up); }
  .sw.down { background: var(--down); }

  .listings { padding-right: 0 !important; display: flex; flex-direction: column; gap: 8px; }
  .listings h2 { font-size: 15px; font-weight: 850; font-stretch: 72%; text-transform: uppercase; letter-spacing: 0.05em; padding-bottom: 6px; border-bottom: 1.5px solid var(--ink); }
  /* Gainers and losers mirrored about one axis. */
  .mirror { display: grid; }
  .mrow { display: grid; grid-template-columns: 92px minmax(0, 1fr) 60px; align-items: center; gap: 10px; height: 31px; border-bottom: 1px solid var(--line); color: var(--ink); }
  .mrow:hover { background: var(--panel-2); color: var(--ink); }
  .mrow .sym { font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; }
  .track { height: 8px; position: relative; }
  .track i { position: absolute; top: 0; bottom: 0; left: 0; background: currentColor; transition: width 0.7s var(--ease); }
  .num { text-align: right; font-weight: 800; font-stretch: 80%; font-size: 14px; }
  .axis { display: flex; justify-content: space-between; padding: 5px 0 4px; border-top: 2px solid var(--ink); border-bottom: 2px solid var(--ink); margin: 2px 0; font: 700 11px var(--font); font-stretch: 78%; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-2); }
  .flows-h { margin-top: 16px; }
  .flows td { height: 34px; font-weight: 700; }
  .flows td:first-child { font-weight: 600; }

  /* Pulse band */
  .pulse { display: grid; gap: 14px; }
  .pulse .stat { display: flex; flex-direction: column; gap: 2px; }
  .pulse a.stat { color: inherit; }
  a.label:hover { color: var(--brand-2); }
  .value { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 6px; }
  .pulse .value { overflow-wrap: normal; font-size: 40px; }
  .value > * { white-space: nowrap; }
  .value a:hover { text-decoration: underline; text-underline-offset: 4px; }
  .slash { color: var(--ink-3); font-weight: 400; }
  .means { margin-top: auto; padding-top: 6px; font-size: 14px; line-height: 1.45; color: var(--ink-2); max-width: 34ch; }
  .ban { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; font-size: 13.5px; color: var(--ink-2); }
  .ban > a:first-child { color: var(--ink); font-weight: 800; font-stretch: 78%; text-transform: uppercase; letter-spacing: 0.05em; }
  .ban .sym { font-size: 13px; color: var(--on-ink); background: var(--ink); padding: 1px 7px; }
  .ban .why { font: italic 13.5px var(--serif); }

  /* Boards */
  .boards { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0; align-items: stretch; }
  .boards .card { display: flex; flex-direction: column; }
  .boards .card:first-child { padding-right: 28px; }
  .boards .card + .card { padding-left: 28px; border-left: 1px solid var(--line-2); border-top: var(--rule-heavy); }
  .more { font: 700 13px var(--font); font-stretch: 85%; text-decoration: underline; text-underline-offset: 3px; }
  .foot { margin-top: auto; padding: 12px 0 0; color: var(--ink-3); font: italic 13px var(--serif); }
  .foot a { text-decoration: underline; text-underline-offset: 3px; }
  .sectors { list-style: none; margin: 0; padding: 0; }
  .sectors a { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) 64px; align-items: center; gap: 16px; padding: 8px 0; border-bottom: 1px solid var(--line); transition: background 0.12s var(--ease); }
  .sectors a:hover { background: var(--panel-2); color: inherit; }
  .sname { display: grid; font-size: 14.5px; font-weight: 700; min-width: 0; }
  .sname small { font-size: 12px; font-weight: 500; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sbar { position: relative; height: 10px; }
  .sbar::after { content: ""; position: absolute; left: 50%; top: -5px; bottom: -5px; width: 1.5px; background: var(--ink); }
  .sbar i { position: absolute; top: 0; bottom: 0; background: currentColor; transition: width 0.6s var(--ease); }

  /* The beginner's page: five newspaper columns under one headline. */
  .learn { display: grid; gap: 22px; border-top: 4px double var(--ink); padding-top: 18px; }
  .learn-head { display: flex; justify-content: space-between; align-items: baseline; gap: 24px; flex-wrap: wrap; }
  .learn-head h2 { font-size: clamp(36px, 4vw, 54px); font-weight: 850; font-stretch: 62%; line-height: 0.95; }
  .learn-head p { font: 17px/1.45 var(--serif); color: var(--ink-2); max-width: 46ch; }
  .ideas { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .ideas article { display: flex; flex-direction: column; gap: 8px; padding: 4px 22px 0; border-left: 1px solid var(--line-2); }
  .ideas article:first-child { padding-left: 0; border-left: 0; }
  .ideas h3 { font-size: 24px; font-weight: 850; font-stretch: 68%; line-height: 1; padding-bottom: 6px; border-bottom: 1.5px solid var(--ink); }
  .ideas p { font: 15px/1.55 var(--serif); color: var(--ink); }
  .ideas p::first-letter { float: left; font: 900 46px/0.8 var(--display); font-stretch: 62%; margin: 4px 4px 0 0; }
  .ideas a { margin-top: auto; padding-top: 6px; font: 800 13px var(--font); font-stretch: 80%; text-transform: uppercase; letter-spacing: 0.05em; }

  @media (max-width: 1180px) {
    .page1 { grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); }
    .scene { grid-column: 2; grid-row: 1 / span 2; }
    .listings { grid-column: 1; grid-row: 2; border-left: 0 !important; padding-left: 0 !important; }
    .ideas { grid-template-columns: repeat(3, minmax(0, 1fr)); row-gap: 26px; }
    .ideas article:nth-child(4) { padding-left: 0; border-left: 0; }
  }
  @media (max-width: 860px) {
    /* Read top down on a phone: the day's story, who moved, then the market as a picture. */
    .front { grid-template-columns: minmax(0, 1fr); gap: 26px; padding-bottom: 32px; }
    .page1 > * { min-width: 0; }
    .indices { position: relative; display: flex; overflow-x: auto; scrollbar-width: none; margin: 0 -16px; padding: 8px 16px; }
    .indices a { flex: none; }
    .asof { display: none; }
    .page1 { display: flex; flex-direction: column; margin-top: -14px; }
    .page1 > * { padding: 16px 0 20px !important; border-left: 0 !important; }
    .page1 > * + * { border-top: 1px solid var(--line-2); }
    .lead { order: 1; gap: 12px; }
    .lead h1 { animation: none; }
    .listings { order: 2; }
    .scene { order: 3; min-height: 0; display: block; }
    .scene figcaption { padding: 0; }
    .caption-top { border-bottom: 0; padding-bottom: 6px !important; }
    .desk-note { display: none; }
    .phone-note { display: inline; }
    .phone-city { display: grid; gap: 12px; }
    .plate { animation: none; display: none; }
    .plate.ready { display: block; height: 380px; }
    .caption { margin-top: 10px; }
    .boards { content-visibility: visible; }
    .mrow { height: 40px; }
    .boards .card .tabs button { padding: 10px 12px; }
    .boards { grid-template-columns: minmax(0, 1fr); gap: 28px; }
    .boards .card:first-child { padding-right: 0; }
    .boards .card + .card { padding-left: 0; border-left: 0; }
    .ideas { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .ideas article:nth-child(odd) { padding-left: 0; border-left: 0; }
    .ideas article:nth-child(4) { padding-left: 22px; border-left: 1px solid var(--line-2); }
  }
  @media (max-width: 640px) {
    .indices a { padding: 0 12px; font-size: 13px; }
    .lead h1 { font-size: clamp(32px, 10vw, 40px); line-height: 0.96; }
    .standfirst { font-size: 16px; }
    .lead :global(.lead input) { height: 46px; font-size: 16px; }
    .lead :global(.lead .go) { height: 46px; }
    .lead :global(.lead .glass) { top: 16px; }
    .caption .dateline { margin-left: 0; }
    .pulse .value { font-size: 28px; }
    .means { font-size: 13px; }
    .sectors a { grid-template-columns: minmax(0, 1fr) 64px; min-height: var(--row); }
    .sbar { display: none; }
    .ideas { grid-template-columns: minmax(0, 1fr); row-gap: 22px; }
    .ideas article { padding-left: 0 !important; border-left: 0 !important; }
  }
</style>
