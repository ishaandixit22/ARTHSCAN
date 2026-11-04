<script lang="ts">
  // Technicals in colour: a tally, the moving averages against today's close, what each oscillator
  // is saying, and the pivot levels from the latest session.
  import { date, num } from "$lib/format";

  let { technicals, loading }: { technicals: any | null; loading: boolean } = $props();
  const WORD = { bullish: "Above", bearish: "Below", neutral: "At" } as const;
  const SIGNAL = { bullish: "Bullish", bearish: "Bearish", neutral: "Neutral" } as const;
  const t = $derived(technicals);
  const total = $derived(t ? t.votes.bullish + t.votes.bearish + t.votes.neutral : 0);
  const share = (n: number) => `${(n / (total || 1)) * 100}%`;
  const PIVOTS = [["R3", "r3", "down"], ["R2", "r2", "down"], ["R1", "r1", "down"], ["Pivot", "pivot", ""], ["S1", "s1", "up"], ["S2", "s2", "up"], ["S3", "s3", "up"]] as const;
</script>

{#if t}
  <div class="tech">
    <section class="tally" aria-label="Signals">
      <div class="meter" aria-hidden="true">
        <i class="bull" style="width: {share(t.votes.bullish)}"></i>
        <i class="flat" style="width: {share(t.votes.neutral)}"></i>
        <i class="bear" style="width: {share(t.votes.bearish)}"></i>
      </div>
      <p><b class="up">{t.votes.bullish} bullish</b> · <b class="flat-t">{t.votes.neutral} neutral</b> · <b class="down">{t.votes.bearish} bearish</b> <span>across {total} signals, at the close of {date(t.as_of)}</span></p>
    </section>

    <section aria-label="Moving averages">
      <h3>Moving averages</h3>
      <table>
        <thead><tr><th class="left">Days</th><th>Simple</th><th>Price is</th><th>Exponential</th><th>Price is</th></tr></thead>
        <tbody>
          {#each t.averages.filter((a: any) => a.sma != null) as a}
            <tr>
              <th class="left" scope="row">{a.period}</th>
              <td>{num(a.sma)}</td>
              <td><span class="tag {a.sma_signal}">{WORD[a.sma_signal as keyof typeof WORD]}</span></td>
              <td>{num(a.ema)}</td>
              <td><span class="tag {a.ema_signal}">{WORD[a.ema_signal as keyof typeof WORD]}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>

    <section aria-label="Oscillators">
      <h3>Momentum</h3>
      <table>
        <thead><tr><th class="left">Measure</th><th>Value</th><th>Signal</th></tr></thead>
        <tbody>
          {#each t.oscillators as o}
            <tr>
              <th class="left" scope="row">{o.name}<small>{o.reading}</small></th>
              <td>{num(o.value)}</td>
              <td><span class="tag {o.signal}">{SIGNAL[o.signal as keyof typeof SIGNAL]}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>

    <section class="pivots" aria-label="Pivot levels">
      <h3>Pivot levels</h3>
      <div class="levels">
        {#each PIVOTS as [label, key, side]}
          <div class={side}><span>{label}</span><b>{num(t.pivots[key])}</b></div>
        {/each}
      </div>
      <p class="note">Worked out from the latest session's high, low and close. Traders watch R levels above the price as possible ceilings and S levels below it as possible floors.</p>
    </section>
  </div>
{:else}
  <div class="empty">{loading ? "Working out technicals…" : "Technicals aren't available right now."}</div>
{/if}

<style>
  .tech { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px 44px; }
  .tally, .pivots { grid-column: 1 / -1; }
  h3 { margin: 0 0 6px; padding-top: 8px; border-top: var(--rule-heavy); font: 800 18px var(--display); font-stretch: 78%; }
  .meter { display: flex; height: 10px; gap: 2px; }
  .meter i { display: block; min-width: 0; }
  .bull { background: var(--up); } .bear { background: var(--down); } .flat { background: var(--line-2); }
  .tally p { margin: 8px 0 0; font-size: 15px; }
  .tally span { color: var(--ink-3); font-size: 13px; }
  .flat-t { color: var(--ink-2); }
  table { width: 100%; font-variant-numeric: tabular-nums; }
  th.left { text-align: left; font-weight: 600; }
  tbody th { border-bottom: 1px solid var(--line); }
  small { display: block; color: var(--ink-3); font-size: 12px; font-weight: 400; }
  .tag { display: inline-block; min-width: 62px; padding: 1px 8px; text-align: center; font-size: 12.5px; font-weight: 700; border-radius: var(--radius-s); }
  .tag.bullish { color: var(--up); background: var(--up-soft); }
  .tag.bearish { color: var(--down); background: var(--down-soft); }
  .tag.neutral { color: var(--ink-2); background: var(--panel-2); }
  .levels { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); margin-top: 4px; }
  .levels div { display: grid; gap: 2px; padding: 8px 10px; border-left: var(--rule); }
  .levels div:first-child { border-left: 0; padding-left: 0; }
  .levels span { font-size: 12.5px; font-weight: 700; color: var(--ink-2); }
  .levels .up span { color: var(--up); } .levels .down span { color: var(--down); }
  .levels b { font: 800 17px var(--display); font-stretch: 74%; font-variant-numeric: tabular-nums; color: var(--ink); }
  .note { margin: 10px 0 0; color: var(--ink-3); font-size: 12.5px; line-height: 1.5; }
  @media (max-width: 860px) {
    .tech { grid-template-columns: minmax(0, 1fr); }
    .levels { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .levels div:nth-child(5) { border-left: 0; padding-left: 0; }
  }
</style>
