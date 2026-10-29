<script lang="ts">
  import StockTable from "$lib/components/StockTable.svelte";
  import MarketCity from "$lib/components/MarketCity.svelte";
  import { BRAND } from "$lib/brand";
  import LiveStamp from "$lib/components/LiveStamp.svelte";
  import { banWhen, cr, crSigned, crore, date, int, pct, tone } from "$lib/format";
  import { market, useLiveMarket, type LiveStock } from "$lib/liveMarket.svelte";
  import { reveal } from "$lib/reveal";

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

  const sectors = $derived(data.sectors.slice(0, 10));
  const sectorMax = $derived(Math.max(0.5, ...sectors.map((s: any) => Math.abs(s.avg_change_pct ?? 0))));

  const cityUp = $derived(data.cityStocks.filter((s) => (s.change ?? 0) > 0).length);
  const cityDown = $derived(data.cityStocks.filter((s) => (s.change ?? 0) < 0).length);

  // Five ideas a first-time investor needs to read this site, each tied to the page that shows it.
  const IDEAS = [
    { term: "Breadth", plain: "Count how many stocks rose and how many fell. An index can rise on a few giants while most stocks fall; breadth tells you which kind of day it was.", href: "/breadth", cta: "See today's breadth" },
    { term: "Sectors", plain: "Companies in the same business tend to move together. Money rotates between sectors, and spotting the rotation early is half of investing.", href: "/sectors", cta: "Watch sector rotation" },
    { term: "P/E ratio", plain: "Price divided by earnings: how many years of today's profit you pay for. Compare a stock's P/E with its own past and its peers, never in isolation.", href: "/valuations", cta: "Is the market cheap?" },
    { term: "FII & DII flows", plain: "Foreign (FII) and Indian (DII) institutions move the biggest money. When both buy, the market usually has a tailwind.", href: "/fii-dii", cta: "Follow the money" },
    { term: "Screening", plain: "Instead of chasing tips, set rules (growing profits, low debt, fair price) and let the screener find every stock that passes.", href: "/screener", cta: "Build your first screen" },
  ];
</script>

<svelte:head><title>{BRAND} — see the Indian stock market clearly</title></svelte:head>

<div class="home">
  <section class="hero">
    <div class="copy">
      <p class="eyebrow"><LiveStamp close="NSE close · {date(data.summary.breadth?.as_of)}" /></p>
      <h1>The stock market,<br /><em>made visible.</em></h1>
      <p class="lede">
        {BRAND} turns all {int(lm ? lm.stocks : b.stocks)} NSE stocks into pictures you can read: what moved, why it matters,
        and where to look next. Built for your first investment and your thousandth.
      </p>
      <div class="cta">
        <a class="btn primary" href="/screener">Find stocks with the screener</a>
        <a class="btn" href="#learn">New here? Start with the basics</a>
      </div>
      <p class="today">
        On {day}, <a class="up" href="/breadth?show=advances">{int(b.advances)} stocks rose</a> and
        <a class="down" href="/breadth?show=declines">{int(b.declines)} fell</a>.
        {#if fii}Foreign institutions were net <a href="/fii-dii" class={tone(fii.net_value)}>{(fii.net_value ?? 0) >= 0 ? "buyers" : "sellers"} of {cr(Math.abs(fii.net_value ?? 0))}</a>.{/if}
      </p>
    </div>

    <figure class="scene">
      {#if data.cityStocks.length}
        <MarketCity stocks={data.cityStocks} label="The Nifty 100 as a 3D city: {cityUp} companies rose and {cityDown} fell on {day}." />
        <figcaption>
          <span><i class="sw up"></i>Rose</span><span><i class="sw down"></i>Fell (sunk below ground)</span>
          <span class="hint">Nifty 100 by sector · height = size of the move · drag to turn, click a tower</span>
        </figcaption>
      {/if}
    </figure>
  </section>

  <section class="pulse" use:reveal aria-label="Market pulse">
    <div class="grid grid-4">
      <div class="stat">
        <a class="label" href="/breadth">Advances / declines</a>
        <div class="value"><a class="up" href="/breadth?show=advances">{int(b.advances)}</a><span class="slash">/</span><a class="down" href="/breadth?show=declines">{int(b.declines)}</a></div>
        <div class="breadth" aria-hidden="true"><span style="width: {adv * 100}%"></span></div>
        <p class="means">Stocks that closed higher vs lower. More risers means a broad, healthy day.</p>
      </div>
      <div class="stat">
        <a class="label" href="/breadth?show=highs">52-week highs / lows</a>
        <div class="value"><a class="up" href="/breadth?show=highs">{int(b.at_52w_high)}</a><span class="slash">/</span><a class="down" href="/breadth?show=lows">{int(b.at_52w_low)}</a></div>
        <p class="means">Stocks at their best or worst price of the past year.</p>
      </div>
      <div class="stat">
        <span class="label">Total turnover</span>
        <div class="value">{cr(b.turnover_cr)}</div>
        <p class="means">The value of every share traded today. Higher means a busier market.</p>
      </div>
      <a class="stat" href="/fii-dii">
        <span class="label">FII / DII net {fii ? `· ${date(fii.date).replace(/ \d{4}$/, "")}` : ""}</span>
        {#if fii || dii}
          <div class="value"><span class={tone(fii?.net_value)}>{crSigned(fii?.net_value)}</span></div>
          <p class="means">Foreign institutions. Indian institutions: <span class={tone(dii?.net_value)}>{crSigned(dii?.net_value)}</span>.</p>
        {:else}
          <div class="value muted">Not loaded</div>
        {/if}
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

  <div class="grid grid-2 boards">
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
          {@const v = s.avg_change_pct ?? 0}
          <li>
            <a href="/sectors/{encodeURIComponent(s.sector)}">
              <span class="sname">{s.sector}<small>{s.stocks} stocks · {crore(s.turnover)}</small></span>
              <span class="bar" aria-hidden="true"><i class={tone(v)} style="width: {(Math.abs(v) / sectorMax) * 50}%; {v < 0 ? 'right: 50%' : 'left: 50%'}"></i></span>
              <span class="num {tone(v)}">{pct(v)}</span>
            </a>
          </li>
        {/each}
      </ul>
      <p class="foot">Average day change of each sector's stocks. 1-month view on <a href="/sectors">sector rotation</a>.</p>
    </section>
  </div>

  <section class="learn" id="learn">
    <div class="learn-head" use:reveal>
      <h2>New to the market?<br /><em>Five ideas unlock everything here.</em></h2>
      <p>No jargon walls. Each idea links to the page where you can see it working on today's data.</p>
    </div>
    <ol>
      {#each IDEAS as idea, i}
        <li use:reveal={i * 80}>
          <span class="n">{String(i + 1).padStart(2, "0")}</span>
          <h3>{idea.term}</h3>
          <p>{idea.plain}</p>
          <a href={idea.href}>{idea.cta} →</a>
        </li>
      {/each}
    </ol>
  </section>
</div>

<style>
  .home { display: grid; gap: 56px; padding: 8px 0 96px; }

  /* Hero: words on the left, the market on the right. */
  .hero { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); align-items: center; gap: 24px; min-height: min(640px, calc(100svh - 120px)); }
  .copy { display: grid; gap: 22px; animation: rise 0.8s var(--ease) both; }
  .eyebrow { font: 500 12.5px var(--mono); color: var(--ink-3); letter-spacing: 0.02em; }
  h1 { font-size: clamp(44px, 6vw, 80px); line-height: 0.98; letter-spacing: -0.02em; }
  h1 em, h2 em { font-style: italic; color: var(--accent); }
  .lede { font-size: 17px; line-height: 1.6; color: var(--ink-2); max-width: 46ch; }
  .cta { display: flex; flex-wrap: wrap; gap: 10px; }
  .cta .btn { height: 46px; padding: 0 22px; font-size: 14px; }
  .today { font-size: 14px; color: var(--ink-3); max-width: 50ch; }
  .today a { font-weight: 500; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; text-decoration-color: color-mix(in srgb, currentColor 35%, transparent); }
  .today a:hover { text-decoration-color: currentColor; }

  .scene { position: relative; margin: 0 -32px 0 0; height: min(620px, calc(100svh - 110px)); display: grid; grid-template-rows: minmax(0, 1fr) auto; animation: fade 1.2s var(--ease) both 0.15s; }
  @keyframes fade { from { opacity: 0; } }
  figcaption { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; padding: 0 32px 0 8px; font-size: 12px; color: var(--ink-3); }
  figcaption span { display: inline-flex; align-items: center; gap: 6px; }
  .sw { width: 9px; height: 9px; border-radius: 2px; }
  .sw.up { background: var(--up); }
  .sw.down { background: var(--down); }
  .hint { margin-left: auto; }

  /* Pulse: one band of four equal readings, each with what it means. */
  .pulse { display: grid; gap: 14px; }
  .pulse .stat { display: flex; flex-direction: column; gap: 4px; }
  .pulse a.stat { color: inherit; }
  .label { color: var(--ink-3); font-size: 12.5px; }
  a.label:hover { color: var(--brand-2); }
  .value { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 8px; }
  .pulse .value { overflow-wrap: normal; }
  .value > * { white-space: nowrap; }
  .value a:hover { text-decoration: underline; text-underline-offset: 4px; }
  .slash { color: var(--ink-3); font-weight: 400; }
  .muted { color: var(--ink-3); font-size: 16px; }
  .means { margin-top: auto; padding-top: 8px; font-size: 12.5px; line-height: 1.5; color: var(--ink-3); max-width: 34ch; }
  .breadth { margin-top: 8px; height: 4px; border-radius: 4px; background: var(--down); overflow: hidden; }
  .breadth span { display: block; height: 100%; background: var(--up); border-radius: 4px; }
  .ban { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; font-size: 13px; color: var(--ink-3); padding: 0 4px; }
  .ban > a:first-child { color: var(--ink-2); font-weight: 500; }
  .ban .sym { font: 500 12.5px var(--mono); color: var(--ink); padding: 1px 8px; border-radius: 999px; background: var(--warn-soft); }
  .ban .why { font-size: 12px; }

  /* Boards */
  .boards { align-items: stretch; }
  .boards .card { display: flex; flex-direction: column; }
  .more { font-size: 13px; color: var(--ink-3); }
  .foot { margin-top: auto; padding: 14px 22px 18px; color: var(--ink-3); font-size: 12px; }
  .foot a { text-decoration: underline; text-underline-offset: 3px; }
  .sectors { list-style: none; margin: 0; padding: 0 8px; }
  .sectors a { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) 72px; align-items: center; gap: 16px; padding: 10px 14px; border-radius: 12px; transition: background 0.15s var(--ease); }
  .sectors a:hover { background: var(--panel-2); color: inherit; }
  .sname { display: grid; font-size: 13.5px; font-weight: 500; min-width: 0; }
  .sname small { font-size: 12px; font-weight: 400; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar { position: relative; height: 6px; border-radius: 6px; background: var(--panel-2); }
  .bar::after { content: ""; position: absolute; left: 50%; top: -3px; bottom: -3px; width: 1px; background: var(--line-2); }
  .bar i { position: absolute; top: 0; bottom: 0; border-radius: 6px; background: currentColor; transition: width 0.6s var(--ease); }
  .num { font: 500 13px var(--mono); text-align: right; }

  /* Learn */
  .learn { display: grid; gap: 36px; padding-top: 24px; }
  .learn-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; flex-wrap: wrap; }
  .learn-head h2 { font: 400 clamp(32px, 4vw, 52px)/1.05 var(--serif); letter-spacing: -0.01em; }
  .learn-head p { color: var(--ink-3); max-width: 40ch; font-size: 14px; }
  ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 32px; }
  ol li { display: flex; flex-direction: column; gap: 10px; padding-top: 20px; border-top: 1px solid var(--line-2); }
  .n { font: italic 400 34px/1 var(--serif); color: var(--accent); }
  ol h3 { font-size: 16px; }
  ol p { font-size: 13.5px; line-height: 1.6; color: var(--ink-2); }
  ol a { margin-top: auto; padding-top: 6px; font-size: 13px; font-weight: 500; color: var(--accent); }
  ol a:hover { color: var(--brand-2); }

  @media (max-width: 1080px) {
    ol { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  @media (max-width: 900px) {
    .hero { grid-template-columns: minmax(0, 1fr); min-height: 0; gap: 8px; }
    .scene { margin: 0 -32px; height: 440px; }
    figcaption { padding: 0 32px; }
    .hint { margin-left: 0; }
    ol { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 640px) {
    .home { gap: 40px; }
    .lede { font-size: 15.5px; }
    .cta .btn { width: 100%; }
    .scene { margin: 0 -16px; height: 360px; }
    figcaption { padding: 0 16px; }
    .pulse .stat .value { font-size: 17px; }
    .means { font-size: 12px; }
    .sectors a { grid-template-columns: minmax(0, 1fr) 64px; }
    .bar { display: none; }
    ol { grid-template-columns: minmax(0, 1fr); gap: 24px; }
  }
</style>
