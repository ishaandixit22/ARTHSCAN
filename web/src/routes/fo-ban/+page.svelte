<script lang="ts">
  import { BRAND } from "$lib/brand";
  import { banWhen, compact, date, num } from "$lib/format";

  let { data } = $props();
  const b = $derived(data.ban);
  const latest = $derived(b.latest as { date: string; symbols: string[] } | null);
  const near = $derived((b.open_interest?.near ?? []) as { symbol: string; name: string | null; pct_mwpl: number; fut_eq_oi: number; mwpl: number; next_day_limit: string | null; in_ban: boolean }[]);
  const nearOnly = $derived(near.filter((n) => !n.in_ban));
  const pctOf = (sym: string) => near.find((n) => n.symbol === sym)?.pct_mwpl ?? null;
  // A stock's position on the way to (or out of) the ban, for its bar colour.
  const zone = (p: number) => (p >= 95 ? "ban" : p >= 90 ? "hot" : "warm");
</script>

<svelte:head><title>F&amp;O ban — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>F&amp;O ban</h1>
      <p class="sub">
        Stocks whose futures and options open interest crossed 95% of the market-wide position limit (MWPL). No new
        positions are allowed until it falls below 80%. NSE sets the list once a day, after the close, for the next session.
      </p>
    </div>
  </div>

  <div class="grid grid-2 top">
    <section class="card">
      <div class="card-head">
        <h2>In ban {banWhen(latest?.date)}</h2>
        {#if latest}<span class="sub">trade date {date(latest.date)}</span>{/if}
      </div>
      {#if latest?.symbols.length}
        <ul class="banned">
          {#each latest.symbols as s}
            {@const p = pctOf(s)}
            <li>
              <a href="/stock/{s}" class="sym">{s}</a>
              <span class="mono">{p == null ? "" : `${num(p, 1)}% of limit`}</span>
            </li>
          {/each}
        </ul>
      {:else if latest}
        <div class="empty">No stocks are in the F&amp;O ban {banWhen(latest.date)}.</div>
      {:else}
        <div class="empty">The ban list isn't loaded yet.</div>
      {/if}
    </section>

    <section class="card">
      <div class="card-head"><h2>Could enter the ban next</h2>{#if b.open_interest?.as_of}<span class="sub">open interest at the close of {date(b.open_interest.as_of)}</span>{/if}</div>
      {#if nearOnly.length}
        <ul class="banned">
          {#each nearOnly.slice(0, 6) as n}
            <li><a href="/stock/{n.symbol}" class="sym">{n.symbol}</a><span class="mono">{num(n.pct_mwpl, 1)}% of limit</span></li>
          {/each}
        </ul>
      {:else}
        <div class="empty">No stock outside the ban is at 80% of its limit or more.</div>
      {/if}
    </section>
  </div>

  <section class="card">
    <div class="card-head"><h2>Near the limit</h2><span class="sub">open interest at 80% of MWPL or more · 95% enters the ban</span></div>
    {#if near.length}
      <div class="table-scroll">
        <table>
          <thead><tr><th>Stock</th><th class="left barcol">Share of limit</th><th>Open interest (shares)</th><th class="wide-only">Limit (MWPL, shares)</th><th class="wide-only">Room for the next day</th></tr></thead>
          <tbody>
            {#each near as n (n.symbol)}
              <tr>
                <td><a href="/stock/{n.symbol}" class="sym">{n.symbol}</a>{#if n.in_ban} <span class="chip down">in ban</span>{/if}<span class="name">{n.name ?? ""}</span></td>
                <td class="left barcol"><div class="barcell">
                  <div class="bar" aria-hidden="true">
                    <span class={zone(n.pct_mwpl)} style="width: {Math.min(100, n.pct_mwpl)}%"></span>
                    <i style="left: 80%"></i><i style="left: 95%"></i>
                  </div>
                  <b class="mono">{num(n.pct_mwpl, 1)}%</b>
                </div></td>
                <td>{compact(n.fut_eq_oi)}</td>
                <td class="wide-only">{compact(n.mwpl)}</td>
                <td class="wide-only">{n.next_day_limit && /^\d+$/.test(n.next_day_limit) ? `${compact(Number(n.next_day_limit))} shares` : (n.next_day_limit ?? "—")}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <div class="empty">Open-interest figures aren't loaded yet.</div>
    {/if}
  </section>

  <section class="card">
    <div class="card-head"><h2>Recent days</h2></div>
    <div class="table-scroll">
      <table>
        <thead><tr><th>Trade date</th><th class="left">In ban</th><th>Stocks</th></tr></thead>
        <tbody>
          {#each b.history as h (h.date)}
            <tr>
              <td>{date(h.date)}</td>
              <td class="left">{#if h.symbols.length}{#each h.symbols as s, i}<a href="/stock/{s}">{s}</a>{i < h.symbols.length - 1 ? ", " : ""}{/each}{:else}<span class="sub">None</span>{/if}</td>
              <td>{h.symbols.length}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <p class="sub small">Source: NSE F&amp;O ban list (fo_secban) and combined open interest across exchanges (combineoi). Both are end-of-day files; neither changes during the session.</p>
</div>

<style>
  .top { align-items: start; }
  .banned { list-style: none; margin: 0; padding: 6px 0; }
  .banned li { display: flex; justify-content: space-between; align-items: center; padding: 10px 18px; border-bottom: 1px solid var(--line); }
  .banned li:last-child { border-bottom: 0; }
  .banned .sym { font-size: 15px; }
  .banned .mono { color: var(--ink-2); font-size: 13px; }
  .barcol { min-width: 240px; }
  .barcell { display: flex; align-items: center; gap: 12px; }
  .bar { position: relative; flex: 1; height: 6px; border-radius: 3px; background: var(--panel-2); max-width: 180px; }
  .bar span { position: absolute; inset: 0 auto 0 0; border-radius: 3px; }
  .bar .warm { background: var(--warn); }
  .bar .hot { background: color-mix(in srgb, var(--down) 70%, var(--warn)); }
  .bar .ban { background: var(--down); }
  .bar i { position: absolute; top: -3px; width: 1px; height: 12px; background: var(--ink-3); }
  .barcell b { font-weight: 500; font-size: 13px; min-width: 52px; text-align: right; }
  .small { font-size: 12.5px; }
  @media (max-width: 640px) { .wide-only { display: none; } .barcol { min-width: 0; } .bar { max-width: 90px; } }
</style>
