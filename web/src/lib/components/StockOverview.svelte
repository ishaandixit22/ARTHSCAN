<script lang="ts">
  // The figures block: four ruled columns of label and value, one format for every stock.
  import { compact, date, num, pct } from "$lib/format";
  import type { figures } from "$lib/stock-reading";

  type Cell = { label: string; value: string; tone?: string; note?: string; title?: string };
  let { f, m, quote, stats, faceValue, bseOnly }: { f: ReturnType<typeof figures>; m: any; quote: any | null; stats: any | null; faceValue: number | null; bseOnly: boolean } = $props();

  const money = (v: number | null | undefined) => (v == null ? "—" : num(v, 2));
  const lakhs = (v: number | null | undefined) => (v == null ? "—" : num(v / 1e5, 2));
  const crores = (v: number | null | undefined) => (v == null ? "—" : num(v, 0));
  const peNote = $derived(f.pe == null || f.sectorPe == null ? undefined : f.pe < f.sectorPe * 0.8 ? "Low P/E" : f.pe > f.sectorPe * 1.3 ? "High P/E" : "Near sector");
  const peTone = $derived(peNote === "Low P/E" ? "up" : peNote === "High P/E" ? "down" : undefined);

  const columns = $derived<Cell[][]>([
    [
      { label: "Open", value: money(quote?.open ?? m.open) },
      { label: "Previous close", value: money(quote?.prev_close ?? m.prev_close) },
      { label: "Volume", value: quote?.volume != null ? num(quote.volume, 0) : m.volume != null ? num(m.volume, 0) : "—" },
      { label: "Value (₹ lakh)", value: lakhs(quote?.value ?? m.turnover) },
      { label: "VWAP", value: money(quote?.vwap), title: "Average price paid today, weighted by the shares traded" },
      { label: "Beta", value: f.beta == null ? "—" : num(f.beta, 2), title: "How much it moves when the Nifty 50 moves 1%, over the past year" },
      { label: "Market cap (₹ Cr)", value: crores(f.marketCapCr) },
    ],
    [
      { label: "High", value: money(quote?.high ?? m.high) },
      { label: "Low", value: money(quote?.low ?? m.low) },
      { label: "Upper circuit", value: money(quote?.upper_circuit), title: "The highest price the exchange allows today" },
      { label: "Lower circuit", value: money(quote?.lower_circuit), title: "The lowest price the exchange allows today" },
      { label: "52-week high", value: money(stats?.extremes?.high_52w ?? f.high52) },
      { label: "52-week low", value: money(stats?.extremes?.low_52w ?? f.low52) },
      { label: "Face value", value: faceValue == null ? "—" : num(faceValue, 2) },
    ],
    [
      { label: "All-time high", value: money(f.ath?.high), note: f.ath ? date(f.ath.high_date) : undefined },
      { label: "All-time low", value: money(f.ath?.low), note: f.ath ? date(f.ath.low_date) : undefined },
      { label: "20-day avg volume", value: m.avg_volume_20d != null ? num(m.avg_volume_20d, 0) : "—" },
      ...(bseOnly ? [] : [{ label: "20-day avg delivery", value: pct(m.deliv_pct_avg_20, false) }]),
      { label: "Book value per share", value: money(f.book) },
      { label: "Dividend yield", value: f.dividendYield == null ? "—" : `${num(f.dividendYield, 2)}%` },
      { label: "Debt to equity", value: f.debtToEquity == null ? "—" : num(f.debtToEquity, 2) },
    ],
    [
      { label: "TTM EPS", value: money(f.eps), note: f.epsYoy == null ? undefined : `${f.epsYoy > 0 ? "+" : ""}${f.epsYoy.toFixed(1)}% YoY`, tone: f.epsYoy == null ? undefined : f.epsYoy >= 0 ? "up" : "down" },
      { label: "TTM P/E", value: f.pe == null ? "—" : num(f.pe, 2), note: peNote, tone: peTone },
      { label: "P/B", value: f.pb == null ? "—" : num(f.pb, 2) },
      { label: "Sector P/E", value: f.sectorPe == null ? "—" : num(f.sectorPe, 2) },
      { label: "ROE", value: f.roe == null ? "—" : `${num(f.roe, 2)}%` },
      { label: "ROCE", value: f.roce == null ? "—" : `${num(f.roce, 2)}%` },
    ],
  ]);
  const session = $derived(quote?.date ?? stats?.as_of ?? m.as_of);
</script>

<section class="ov" aria-label="Key figures">
  <div class="cols">
    {#each columns as col}
      <dl>
        {#each col as c}
          <div title={c.title}>
            <dt>{c.label}</dt>
            <dd>{c.value}{#if c.note}<small class={c.tone}>{c.note}</small>{/if}</dd>
          </div>
        {/each}
      </dl>
    {/each}
  </div>
  <p class="foot">Session of {date(session)}. Prices and limits from Dhan{bseOnly ? " for BSE" : ""}; ratios from Dhan and company filings.</p>
</section>

<style>
  .ov { border-top: var(--rule-heavy); }
  .cols { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0 28px; }
  dl { margin: 0; }
  dl div { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 8px 0; border-bottom: 1px dotted var(--line-2); }
  dt { color: var(--ink-2); font-size: 14px; }
  dd { margin: 0; font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
  small { display: block; color: var(--ink-3); font-size: 11.5px; font-weight: 600; }
  small.up { color: var(--up); } small.down { color: var(--down); }
  .foot { margin: 8px 0 0; color: var(--ink-3); font-size: 12.5px; }
  @media (max-width: 1000px) { .cols { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 560px) { .cols { grid-template-columns: minmax(0, 1fr); } }
</style>
