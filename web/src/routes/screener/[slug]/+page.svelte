<script lang="ts">
  import { BRAND } from "$lib/brand";
  import { cr, date, int, num, pct, price, tone } from "$lib/format";

  let { data } = $props();
  const s = $derived(data.screen);

  const UNIVERSE: Record<string, string> = { all: "All NSE stocks", fno: "F&O stocks", nifty50: "Nifty 50", nifty500: "Nifty 500" };
  const clock = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
  const clockSec = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });

  function fresh(f: any): { badge: string; live: boolean; text: string } {
    switch (f.mode) {
      case "live": return { badge: "Live", live: true, text: `Prices at ${clockSec(f.as_of)} IST` };
      case "close": return { badge: "Market closed", live: false, text: `Last close, ${date(f.as_of)}` };
      case "intraday": return { badge: "Intraday", live: false, text: `Last finished candle ended ${clock(f.as_of)} IST. Refreshes about every 5 minutes in market hours.` };
      default: return { badge: "Weekly", live: false, text: `Run ${date(new Date(f.computed_at * 1000).toISOString())} on the close of ${date(f.as_of)}. Refreshes every Sunday.` };
    }
  }

  function sortHref(key: string) {
    const dir = data.sort === key && data.dir === "desc" ? "asc" : "desc";
    return `?${new URLSearchParams({ sort: key, dir })}`;
  }
  const pageHref = (p: number) => `?${new URLSearchParams({ sort: data.sort, dir: data.dir, page: String(p) })}`;
  const arrow = (key: string) => (data.sort === key ? (data.dir === "asc" ? " ↑" : " ↓") : "");

  // Live screens run from the browser, so the rules show at once and "Run again" needs no page load.
  let live = $state<any>(null);
  let running = $state(false);
  let failed = $state(false);
  let lastSlug = "";
  let ticket = 0;

  async function run(slug: string, qs: string) {
    const mine = ++ticket;
    running = true;
    failed = false;
    try {
      const res = await fetch(`/api/screens/${encodeURIComponent(slug)}?${qs}`);
      const body = res.ok ? await res.json() : null;
      if (mine !== ticket) return;
      if (body?.freshness) live = body; else failed = true;
    } catch {
      if (mine === ticket) failed = true;
    } finally {
      if (mine === ticket) running = false;
    }
  }

  $effect(() => {
    if (s.kind !== "live") return;
    if (s.slug !== lastSlug) { live = null; lastSlug = s.slug; }
    run(s.slug, data.qs);
  });

  const result = $derived(s.kind === "live" ? live : data.result);
</script>

<svelte:head>
  <title>{s.name} — Stock screener — {BRAND}</title>
  <meta name="description" content={s.description} />
</svelte:head>

<div class="page">
  <a class="back sub" href={s.segment === "technical" ? "/screener?tab=technical" : "/screener"}>← {s.segment === "technical" ? "Technical" : "Fundamental"} screens</a>
  <div class="page-head">
    <div>
      <h1>{s.name}</h1>
      <p class="sub">{s.subsegment}{s.group ? ` · ${s.group}` : ""}{s.timeframe ? ` · ${s.timeframe}` : ""} · {UNIVERSE[s.universe]}</p>
    </div>
  </div>

  <p class="about">{s.description}</p>

  <section class="card card-body rules">
    <h2>Rules</h2>
    <p class="sub">A stock must meet all of these.</p>
    <ul>
      {#each s.rules as r}
        <li>{r.text}{#if r.any}<ul>{#each r.any as a}<li>{a}</li>{/each}</ul>{/if}</li>
      {/each}
    </ul>
    {#if s.note}<p class="sub note">{s.note}</p>{/if}
    {#if s.kind === "intraday"}<p class="sub note">Uses finished candles only, so a signal can't appear and then vanish before its candle ends.</p>{/if}
  </section>

  <section class="card results">
    {#if !result?.freshness}
      {#if s.kind === "live" && !failed}
        <div class="card-head"><h2>Running this screen…</h2></div>
        <div class="wait sub" aria-live="polite">Checking stocks against current prices. This can take a few seconds.</div>
        <noscript><div class="wait sub">Live screens need JavaScript to run.</div></noscript>
      {:else}
        <div class="card-head"><h2>No results yet</h2></div>
        <div class="wait sub">
          {#if s.kind === "weekly"}This screen's first weekly run hasn't finished.{:else if s.kind === "intraday"}This screen runs during market hours and hasn't had a run yet.{:else}We couldn't run this screen just now.{/if}
          {#if s.kind === "live"}<button class="btn small" onclick={() => run(s.slug, data.qs)}>Try again</button>{/if}
        </div>
      {/if}
    {:else}
      {@const r = result}
        {@const f = fresh(r.freshness)}
        <div class="card-head">
          <h2>{r.checked === 0 ? "Waiting for data" : `${int(r.total)} ${r.total === 1 ? "stock" : "stocks"}`}</h2>
          <div class="fresh">
            <span class="badge" class:live={f.live}>{f.badge}</span>
            <span class="sub">{f.text}</span>
            {#if s.kind === "live"}<button class="btn small" onclick={() => run(s.slug, data.qs)} disabled={running}>{running ? "Running…" : "Run again"}</button>{/if}
          </div>
        </div>
        {#if r.checked === 0}
          <div class="wait sub">We don't hold the figures these rules read for any stock yet, so this screen can't give an answer. They're being loaded in the background, and results will appear here once they are.</div>
        {:else}
        <p class="sub checked">
          Checked {int(r.checked)} stocks{#if r.freshness.live_stocks}, {int(r.freshness.live_stocks)} with a trade today; the rest are on their last close{/if}.
          {#if s.kind !== "intraday" && s.segment === "fundamental"}Stocks without loaded company statements aren't included.{/if}
        </p>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th><a class="sort" class:on={data.sort === "symbol"} href={sortHref("symbol")}>Stock{arrow("symbol")}</a></th>
                <th><a class="sort" class:on={data.sort === "price"} href={sortHref("price")}>Price{arrow("price")}</a></th>
                <th><a class="sort" class:on={data.sort === "change"} href={sortHref("change")}>Day{arrow("change")}</a></th>
                <th class="wide-only"><a class="sort" class:on={data.sort === "mcap"} href={sortHref("mcap")}>Market cap{arrow("mcap")}</a></th>
                {#each s.columns as c, i}
                  <th class="wide-only"><a class="sort" class:on={data.sort === `v${i}`} href={sortHref(`v${i}`)}>{c.label}{arrow(`v${i}`)}</a></th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each r.results as row (row.symbol)}
                <tr>
                  <td><a href="/stock/{row.symbol}" class="sym">{row.symbol}</a><span class="name">{row.name}</span></td>
                  <td>{price(row.price)}</td>
                  <td class={tone(row.change_pct)}>{pct(row.change_pct)}</td>
                  <td class="wide-only">{cr(row.mcap)}</td>
                  {#each row.values as v}<td class="wide-only">{num(v)}</td>{/each}
                </tr>
              {:else}
                <tr><td colspan={4 + s.columns.length} class="empty">No stocks meet these rules right now.</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if r.pages > 1}
          <div class="pager">
            {#if r.page > 1}<a class="btn small" href={pageHref(r.page - 1)}>← Previous</a>{/if}
            <span class="sub">Page {r.page} of {r.pages}</span>
            {#if r.page < r.pages}<a class="btn small" href={pageHref(r.page + 1)}>Next →</a>{/if}
          </div>
        {/if}
        {/if}
    {/if}
  </section>

  <p class="sub foot">This list shows stocks that meet the rules above. It isn't a recommendation or investment advice.</p>
</div>

<style>
  .back { text-decoration: none; }
  .about { margin: 0; max-width: 72ch; }
  .rules h2 { margin: 0; font-size: 16px; }
  .rules > .sub { margin: 2px 0 8px; }
  .rules ul { margin: 0; padding-left: 20px; display: grid; gap: 4px; font-size: 14px; overflow-wrap: anywhere; }
  .note { margin: 10px 0 0; font-size: 13px; }
  .results h2 { margin: 0; }
  .fresh { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; justify-content: flex-end; font-size: 13px; }
  .badge { padding: 2px 8px; border-radius: 999px; background: var(--panel-2); font-size: 12px; font-weight: 600; color: var(--ink-2); }
  .badge.live { background: var(--brand-soft); color: var(--brand); }
  .checked { margin: 0; padding: 0 16px 10px; font-size: 12.5px; }
  .wait { padding: 20px 16px; }
  .sort { color: inherit; text-decoration: none; }
  .sort.on { color: var(--ink); font-weight: 600; }
  .pager { display: flex; gap: 12px; align-items: center; justify-content: center; padding: 12px; }
  .foot { font-size: 12.5px; }
  @media (max-width: 640px) { .wide-only { display: none; } .fresh { justify-content: flex-start; } }
</style>
