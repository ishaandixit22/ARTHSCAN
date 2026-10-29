<script lang="ts">
  import { BRAND } from "$lib/brand";
  import { cr, crSigned, date, tone } from "$lib/format";
  import FlowChart from "$lib/components/FlowChart.svelte";

  type Day = { date: string; buy: number | null; sell: number | null; net: number };
  type Sector = { sector: string; auc: number | null; flows: (number | null)[] };

  let { data } = $props();
  const range = $derived(data.range as "1d" | "1w" | "1m" | "1y");
  const LABEL: Record<string, string> = { "1d": "1 day", "1w": "1 week", "1m": "1 month", "1y": "1 year" };

  // ── NSDL whole-market daily flows ────────────────────────────────
  const fpiDaily = $derived((data.fpi?.daily ?? []) as Day[]);
  const latest = $derived(fpiDaily.at(-1)?.date ?? null);
  const minus = (iso: string, days: number, months = 0, years = 0) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCFullYear(d.getUTCFullYear() - years, d.getUTCMonth() - months, d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
  };
  const windowStart = $derived(
    !latest ? "" : range === "1d" ? latest : range === "1w" ? minus(latest, 7) : range === "1m" ? minus(latest, 0, 1) : minus(latest, 0, 0, 1),
  );
  const inWindow = $derived(fpiDaily.filter((d) => (range === "1d" ? d.date === latest : d.date > windowStart)));
  const sum = (xs: (number | null)[]) => xs.reduce<number>((a, v) => a + (v ?? 0), 0);
  const windowNet = $derived(sum(inWindow.map((d) => d.net)));
  const windowBuy = $derived(sum(inWindow.map((d) => d.buy)));
  const windowSell = $derived(sum(inWindow.map((d) => d.sell)));
  const sellDays = $derived(inWindow.filter((d) => d.net < 0).length);

  const shortDate = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

  // Bars: daily sessions, except a year, which reads better as weekly totals.
  const bars = $derived.by(() => {
    if (range === "1d") return fpiDaily.slice(-10).map((d) => ({ label: shortDate(d.date), value: d.net, note: date(d.date) }));
    if (range !== "1y") return inWindow.map((d) => ({ label: shortDate(d.date), value: d.net, note: date(d.date) }));
    const weeks = new Map<string, { first: string; last: string; net: number }>();
    for (const d of inWindow) {
      const t = new Date(`${d.date}T00:00:00Z`);
      t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); // Monday of that week
      const k = t.toISOString().slice(0, 10);
      const w = weeks.get(k) ?? { first: d.date, last: d.date, net: 0 };
      w.last = d.date;
      w.net += d.net;
      weeks.set(k, w);
    }
    return [...weeks.values()].map((w) => ({ label: shortDate(w.first), value: Math.round(w.net), note: `Week of ${shortDate(w.first)}` }));
  });
  const cumulative = $derived.by(() => {
    let run = 0;
    const src = range === "1d" ? fpiDaily.slice(-10) : inWindow;
    return src.map((d) => ({ label: shortDate(d.date), value: Math.round((run += d.net)), note: `To ${date(d.date)}` }));
  });

  // ── NSDL sector flows (fortnightly) ──────────────────────────────
  const ends = $derived((data.fpi?.fortnights ?? []) as string[]);
  const sectors = $derived((data.fpi?.sectors ?? []) as Sector[]);
  const total = $derived(data.fpi?.total as Sector | null);
  // Fortnights inside the range: a day or a week falls inside the latest one.
  const take = $derived(range === "1y" ? 24 : range === "1m" ? 2 : 1);
  const from = $derived(Math.max(0, ends.length - take));
  const fortnightStart = (i: number) => {
    const e = ends[i];
    return e.endsWith("-15") ? `${e.slice(0, 8)}01` : `${e.slice(0, 8)}16`;
  };
  const periodLabel = $derived.by(() => {
    if (!ends.length) return "";
    const start = fortnightStart(from);
    return `${start.slice(0, 4) === ends.at(-1)!.slice(0, 4) ? shortDate(start) : date(start)} – ${date(ends.at(-1))}`;
  });
  const totalAuc = $derived(sum(sectors.map((s) => s.auc)));
  const rows = $derived(
    sectors
      .map((s) => {
        const net = sum(s.flows.slice(from));
        return { ...s, net, ofAuc: s.auc ? (net / s.auc) * 100 : null, share: s.auc && totalAuc ? (s.auc / totalAuc) * 100 : null };
      })
      .sort((a, b) => b.net - a.net),
  );
  const maxAbsNet = $derived(Math.max(1, ...rows.map((r) => Math.abs(r.net))));
  const inflowSectors = $derived(rows.filter((r) => r.net > 0).length);

  // Heat grid: last 12 fortnights, coloured by flow as a share of the sector's holdings
  // so a small sector's big move shows as clearly as a large sector's.
  const gridFrom = $derived(Math.max(0, ends.length - 12));
  const heat = (net: number | null, auc: number | null) => {
    if (net == null || !auc) return "transparent";
    const p = Math.min(1, Math.abs(net / auc) / 0.02); // ±2% of holdings = full colour
    const pctMix = Math.round(10 + p * 42); // capped so cell text keeps 4.5:1
    return `color-mix(in srgb, var(${net > 0 ? "--up" : "--down"}) ${pctMix}%, var(--panel))`;
  };

  // Detail chart: the whole market or one sector.
  const picked = $derived(sectors.find((s) => s.sector === data.sector) ?? null);
  const focus = $derived(picked ?? total);
  const focusBars = $derived(
    (focus?.flows ?? []).map((v, i) => ({ label: shortDate(ends[i]), value: v, note: `${shortDate(fortnightStart(i))} – ${date(ends[i])}` })),
  );
  const focusCum = $derived.by(() => {
    let run = 0;
    return (focus?.flows ?? []).map((v, i) => ({ label: shortDate(ends[i]), value: (run += v ?? 0), note: `To ${date(ends[i])}` }));
  });
  const focusRank = $derived(picked ? rows.findIndex((r) => r.sector === picked.sector) + 1 : null);
  const href = (params: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const next = { range, sector: data.sector, ...params };
    if (next.range && next.range !== "1m") q.set("range", next.range);
    if (next.sector) q.set("sector", next.sector);
    const s = q.toString();
    return s ? `?${s}` : "?";
  };

  // ── NSE provisional (same-day, with DII) ─────────────────────────
  const nseDaily = $derived(data.flows.daily);
  const nseLatest = $derived(nseDaily[0]);
</script>

<svelte:head><title>FII / DII flows — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>FII / DII flows</h1>
      <p class="sub">Where foreign portfolio money is going: the whole market day by day, and each sector fortnight by fortnight. INR crore.</p>
    </div>
    <div class="tabs" role="tablist" aria-label="Time range">
      {#each data.ranges as r}
        <a href={href({ range: r })} class:active={range === r} role="tab" aria-selected={range === r} data-sveltekit-noscroll>{r.toUpperCase()}</a>
      {/each}
    </div>
  </div>

  {#if !fpiDaily.length}
    <div class="notice">FPI flow data isn't loaded yet. See <code>pipeline/README.md</code> → NSDL FPI flows.</div>
  {:else}
    <!-- Headline numbers for the range -->
    <div class="grid grid-4">
      <div class="card stat">
        <div class="label">FPI net · {range === "1d" ? date(latest) : `last ${LABEL[range]}`}</div>
        <div class="value {tone(windowNet)}">{crSigned(Math.round(windowNet))}</div>
        <div class="sub">{windowNet >= 0 ? "Net buyers" : "Net sellers"} · {inWindow.length} session{inWindow.length === 1 ? "" : "s"}</div>
      </div>
      <div class="card stat">
        <div class="label">Bought / sold</div>
        <div class="value">{cr(Math.round(windowBuy))}</div>
        <div class="sub">Sold {cr(Math.round(windowSell))}</div>
      </div>
      <div class="card stat">
        <div class="label">Selling sessions</div>
        <div class="value">{sellDays} <span class="of">of {inWindow.length}</span></div>
        <div class="sub">Sessions with net outflow</div>
      </div>
      <div class="card stat">
        <div class="label">Sectors with inflows</div>
        <div class="value">{inflowSectors} <span class="of">of {rows.length}</span></div>
        <div class="sub">{periodLabel}</div>
      </div>
    </div>

    <!-- Whole market -->
    <section class="card">
      <div class="card-head">
        <h2>Whole market · {range === "1d" ? "last 10 sessions" : range === "1y" ? "weekly, last year" : `daily, last ${LABEL[range]}`}</h2>
        <span class="legend"><i class="sw pos"></i>Net buying <i class="sw neg"></i>Net selling</span>
      </div>
      <div class="card-body">
        <FlowChart points={bars} label="FPI net equity flows" />
      </div>
      <div class="card-head sub-head"><h3>Running total</h3></div>
      <div class="card-body">
        <FlowChart points={cumulative} kind="line" height={160} label="Cumulative FPI net equity flows" />
      </div>
    </section>

    <!-- Sector flows for the range -->
    <section class="card">
      <div class="card-head">
        <div>
          <h2>Sector flows · {periodLabel}</h2>
          {#if range === "1d" || range === "1w"}
            <p class="sub note">NSDL reports sector flows every fortnight, not daily, so {LABEL[range]} shows the latest fortnight.</p>
          {/if}
        </div>
      </div>
      <div class="table-scroll">
        <table class="sectors">
          <thead>
            <tr><th>Sector</th><th class="left flowcol">Net flow</th><th>% of holdings</th><th class="wide-only">FPI holdings</th><th class="wide-only">Share</th><th class="left wide-only">Last 24 fortnights</th></tr>
          </thead>
          <tbody>
            {#each rows as r (r.sector)}
              <tr class:picked={data.sector === r.sector}>
                <td><a href="{href({ sector: r.sector })}#detail" data-sveltekit-noscroll>{r.sector}</a></td>
                <td class="left flowcol"><div class="flowcell">
                  <div class="diverge" aria-hidden="true">
                    <span class="half l">{#if r.net < 0}<i class="neg" style="width: {(-r.net / maxAbsNet) * 100}%"></i>{/if}</span>
                    <span class="half r">{#if r.net > 0}<i class="pos" style="width: {(r.net / maxAbsNet) * 100}%"></i>{/if}</span>
                  </div>
                  <span class="amt {tone(r.net)}">{crSigned(r.net)}</span>
                </div></td>
                <td class={tone(r.ofAuc)}>{r.ofAuc == null ? "—" : `${r.ofAuc > 0 ? "+" : ""}${r.ofAuc.toFixed(2)}%`}</td>
                <td class="wide-only">{cr(r.auc)}</td>
                <td class="wide-only">{r.share == null ? "—" : `${r.share.toFixed(1)}%`}</td>
                <td class="left wide-only"><svg class="spark" viewBox="0 0 96 24" aria-hidden="true">
                  {#each r.flows as v, i}
                    {@const m = Math.max(1, ...r.flows.map((f) => Math.abs(f ?? 0)))}
                    {#if v}<rect x={i * 4} width="3" y={v > 0 ? 12 - (v / m) * 11 : 12} height={Math.max(0.5, (Math.abs(v) / m) * 11)} class={v > 0 ? "pos" : "neg"} />{/if}
                  {/each}
                  <line x1="0" x2="96" y1="12" y2="12" />
                </svg></td>
              </tr>
            {/each}
          </tbody>
          {#if total}
            <tfoot>
              <tr>
                <td><a href="{href({ sector: null })}#detail" data-sveltekit-noscroll>All sectors</a></td>
                <td class="left flowcol"><span class="amt {tone(sum(total.flows.slice(from)))}">{crSigned(sum(total.flows.slice(from)))}</span></td>
                <td></td><td class="wide-only">{cr(total.auc)}</td><td class="wide-only"></td><td class="wide-only"></td>
              </tr>
            </tfoot>
          {/if}
        </table>
      </div>
    </section>

    <!-- Rotation grid -->
    <section class="card">
      <div class="card-head">
        <h2>Sector rotation · last 12 fortnights</h2>
        <span class="legend">Colour = flow as % of the sector's FPI holdings (full colour at ±2%)</span>
      </div>
      <div class="table-scroll">
        <table class="heat">
          <thead>
            <tr><th>Sector</th>{#each ends.slice(gridFrom) as e}<th class="fn">{shortDate(e)}</th>{/each}</tr>
          </thead>
          <tbody>
            {#each sectors as s (s.sector)}
              <tr>
                <td><a href="{href({ sector: s.sector })}#detail" data-sveltekit-noscroll>{s.sector}</a></td>
                {#each s.flows.slice(gridFrom) as v, j}
                  <td class="cell" style="background: {heat(v, s.auc)}" title="{s.sector}, fortnight to {date(ends[gridFrom + j])}: {crSigned(v)}">
                    {v == null ? "" : Math.abs(v) >= 1000 ? `${v > 0 ? "+" : "−"}${(Math.abs(v) / 1000).toFixed(1)}k` : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}`}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <!-- One sector (or all) in detail -->
    <section class="card" id="detail">
      <div class="card-head">
        <div>
          <h2>{picked ? picked.sector : "All sectors"} · fortnightly flows</h2>
          <p class="sub note">
            {#if picked}
              FPI holdings {cr(picked.auc)} ({rows.find((r) => r.sector === picked.sector)?.share?.toFixed(1)}% of FPI equity) · rank {focusRank} of {rows.length} by flow over {LABEL[range]}.
              <a href="{href({ sector: null })}#detail" data-sveltekit-noscroll>Show all sectors</a>
            {:else}
              Pick a sector in the tables above to see its flows.
            {/if}
          </p>
        </div>
        <span class="legend"><i class="sw pos"></i>Inflow <i class="sw neg"></i>Outflow</span>
      </div>
      <div class="card-body">
        <FlowChart points={focusBars} label="{picked?.sector ?? 'All sectors'} fortnightly FPI flows" />
      </div>
      <div class="card-head sub-head"><h3>Running total over the year</h3></div>
      <div class="card-body">
        <FlowChart points={focusCum} kind="line" height={160} label="{picked?.sector ?? 'All sectors'} cumulative FPI flows" />
      </div>
    </section>
  {/if}

  <!-- NSE same-day provisional figures -->
  <section class="card">
    <div class="card-head">
      <div>
        <h2>FII and DII · today's provisional figures</h2>
        <p class="sub note">NSE's same-day cash-market numbers, including domestic institutions. NSDL's figures above are confirmed a day later and can differ slightly.</p>
      </div>
    </div>
    {#if !nseLatest}
      <div class="card-body sub">No NSE figures loaded yet.</div>
    {:else}
      <div class="grid grid-2 pad">
        <div class="stat">
          <div class="label">FII / FPI net · {date(nseLatest.date)}</div>
          <div class="value {tone(nseLatest.fii_net)}">{crSigned(nseLatest.fii_net)}</div>
          <div class="sub">Bought {cr(nseLatest.fii_buy)} · Sold {cr(nseLatest.fii_sell)}</div>
        </div>
        <div class="stat">
          <div class="label">DII net · {date(nseLatest.date)}</div>
          <div class="value {tone(nseLatest.dii_net)}">{crSigned(nseLatest.dii_net)}</div>
          <div class="sub">Bought {cr(nseLatest.dii_buy)} · Sold {cr(nseLatest.dii_sell)}</div>
        </div>
      </div>
      {#if nseDaily.length > 1}
        <div class="table-scroll">
          <table>
            <thead><tr><th>Date</th><th>FII buy</th><th>FII sell</th><th>FII net</th><th>DII buy</th><th>DII sell</th><th>DII net</th></tr></thead>
            <tbody>
              {#each nseDaily as d}
                <tr>
                  <td>{date(d.date)}</td><td>{cr(d.fii_buy)}</td><td>{cr(d.fii_sell)}</td><td class={tone(d.fii_net)}>{crSigned(d.fii_net)}</td>
                  <td>{cr(d.dii_buy)}</td><td>{cr(d.dii_sell)}</td><td class={tone(d.dii_net)}>{crSigned(d.dii_net)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {/if}
  </section>

  <p class="sub source">Sources: NSDL FPI Monitor (daily trends and fortnightly sector-wise data; sectors follow BSE's industry classification), NSE provisional FII/DII activity. Equity only.</p>
</div>

<style>
  .stat .sub { font-size: 13px; margin-top: 4px; }
  .of { font-size: 14px; color: var(--ink-3); font-weight: 400; }
  .legend { display: flex; gap: 6px; align-items: center; font-size: 12.5px; color: var(--ink-3); flex-wrap: wrap; }
  .sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-left: 6px; }
  .sw.pos { background: var(--up); }
  .sw.neg { background: var(--down); }
  .sub-head { border-top: 1px solid var(--line); padding-top: 10px; padding-bottom: 0; border-bottom: 0; }
  .sub-head h3 { font-size: 13px; font-weight: 500; color: var(--ink-2); margin: 0; }
  .note { margin: 4px 0 0; font-size: 12.5px; }
  .pad { padding: 14px 16px; }
  .source { font-size: 12.5px; }

  .sectors .flowcol { min-width: 230px; }
  .flowcell { display: flex; align-items: center; gap: 10px; }
  .diverge { display: flex; width: 120px; height: 10px; flex-shrink: 0; }
  .diverge .half { flex: 1; display: flex; }
  .diverge .l { justify-content: flex-end; border-right: 1px solid var(--line-2); }
  .diverge i { display: block; height: 100%; }
  .diverge .neg { background: var(--down); border-radius: 3px 0 0 3px; }
  .diverge .pos { background: var(--up); border-radius: 0 3px 3px 0; }
  .amt { font-variant-numeric: tabular-nums; }
  tr.picked td { background: var(--panel-2); }
  tfoot td { font-weight: 600; border-top: 1px solid var(--line-2); }
  .spark { width: 96px; height: 24px; display: block; }
  .spark .pos { fill: var(--up); }
  .spark .neg { fill: var(--down); }
  .spark line { stroke: var(--line-2); stroke-width: 0.5; }

  .heat td.cell { text-align: center; font-size: 11.5px; min-width: 58px; color: var(--ink); border: 2px solid var(--panel); font-variant-numeric: tabular-nums; }
  .heat th.fn { text-align: center; font-size: 11.5px; white-space: nowrap; }
  .heat td:first-child, .sectors td:first-child { white-space: nowrap; }
  @media (max-width: 640px) {
    .wide-only { display: none; }
    .sectors .flowcol { min-width: 0; }
    .diverge { width: 60px; }
    .heat td:first-child, .sectors td:first-child { white-space: normal; min-width: 120px; }
  }
</style>
