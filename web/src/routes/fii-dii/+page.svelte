<script lang="ts">
  import { BRAND } from "$lib/brand";
  import { cr, date, tone } from "$lib/format";

  let { data } = $props();
  const daily = $derived(data.flows.daily);
  const monthly = $derived([...data.flows.monthly].reverse());
  const maxAbs = $derived(Math.max(1, ...monthly.flatMap((m: any) => [Math.abs(m.fii_net), Math.abs(m.dii_net)])));
  const latest = $derived(daily[0]);
</script>

<svelte:head><title>FII / DII flows — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>FII / DII activity</h1>
      <p class="sub">Cash-market buying and selling by foreign (FII/FPI) and domestic (DII) institutions, INR crore. Provisional NSE figures.</p>
    </div>
  </div>

  {#if !daily.length}
    <div class="notice">
      No FII/DII data loaded yet. Download the day's “FII/DII trading activity” from NSE and run
      <code>npm run data:import -- fii-dii &lt;file&gt;</code>. See <code>pipeline/README.md</code>.
    </div>
  {:else}
    <div class="grid grid-2">
      <div class="card stat">
        <div class="label">FII / FPI net · {date(latest.date)}</div>
        <div class="value {tone(latest.fii_net)}">{cr(latest.fii_net)}</div>
        <div class="sub">Bought {cr(latest.fii_buy)} · Sold {cr(latest.fii_sell)}</div>
      </div>
      <div class="card stat">
        <div class="label">DII net · {date(latest.date)}</div>
        <div class="value {tone(latest.dii_net)}">{cr(latest.dii_net)}</div>
        <div class="sub">Bought {cr(latest.dii_buy)} · Sold {cr(latest.dii_sell)}</div>
      </div>
    </div>

    <section class="card">
      <div class="card-head"><h2>Monthly net flows</h2>
        <span class="legend"><i class="sw fii"></i>FII <i class="sw dii"></i>DII</span>
      </div>
      <div class="card-body bars" role="img" aria-label="Monthly FII and DII net flows">
        {#each monthly as m}
          <div class="col" title="{m.month}: FII {cr(m.fii_net)}, DII {cr(m.dii_net)}">
            <div class="half pos">
              {#if m.fii_net > 0}<span class="b fii" style="height: {(m.fii_net / maxAbs) * 100}%"></span>{/if}
              {#if m.dii_net > 0}<span class="b dii" style="height: {(m.dii_net / maxAbs) * 100}%"></span>{/if}
            </div>
            <div class="half neg">
              {#if m.fii_net < 0}<span class="b fii" style="height: {(-m.fii_net / maxAbs) * 100}%"></span>{/if}
              {#if m.dii_net < 0}<span class="b dii" style="height: {(-m.dii_net / maxAbs) * 100}%"></span>{/if}
            </div>
            <small>{m.month.slice(2)}</small>
          </div>
        {/each}
      </div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Month</th><th>FII net</th><th>DII net</th><th>Days</th></tr></thead>
          <tbody>
            {#each [...monthly].reverse() as m}
              <tr><td>{m.month}</td><td class={tone(m.fii_net)}>{cr(m.fii_net)}</td><td class={tone(m.dii_net)}>{cr(m.dii_net)}</td><td>{m.days}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Daily</h2></div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Date</th><th>FII buy</th><th>FII sell</th><th>FII net</th><th>DII buy</th><th>DII sell</th><th>DII net</th></tr></thead>
          <tbody>
            {#each daily as d}
              <tr>
                <td>{date(d.date)}</td><td>{cr(d.fii_buy)}</td><td>{cr(d.fii_sell)}</td><td class={tone(d.fii_net)}>{cr(d.fii_net)}</td>
                <td>{cr(d.dii_buy)}</td><td>{cr(d.dii_sell)}</td><td class={tone(d.dii_net)}>{cr(d.dii_net)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
</div>

<style>
  .stat .sub { font-size: 13px; margin-top: 4px; }
  .legend { display: flex; gap: 6px; align-items: center; font-size: 13px; color: var(--ink-2); }
  .sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-left: 6px; }
  .fii { background: #3b82c4; }
  .dii { background: #d08a2c; }
  .bars { display: flex; gap: 10px; height: 240px; align-items: stretch; overflow-x: auto; }
  .col { flex: 1; min-width: 34px; display: grid; grid-template-rows: 1fr 1fr auto; }
  .half { display: flex; gap: 2px; justify-content: center; }
  .half.pos { align-items: flex-end; border-bottom: 1px solid var(--line-2); }
  .half.neg { align-items: flex-start; }
  .b { width: 12px; border-radius: 2px; }
  small { text-align: center; color: var(--ink-3); font-size: 11px; padding-top: 4px; }
</style>
