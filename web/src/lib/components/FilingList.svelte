<script lang="ts">
  // Exchange filings as a list: time, company, what kind of filing, its subject,
  // and the PDF on NSE's archive. Used by the filings page, the earnings tracker
  // and a stock's Filings tab.
  export type Filing = { time: string | null; symbol: string; company: string; kind: string; subject: string; category: string; pdf: string | null; size: string | null };
  let { filings, kinds, showCompany = true, empty = "No filings." }: { filings: Filing[]; kinds: Record<string, string>; showCompany?: boolean; empty?: string } = $props();

  const when = (t: string | null) => {
    if (!t) return "—";
    const [d, hm] = t.split(" ");
    const day = new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
    return hm ? `${day}, ${hm}` : day;
  };
  const strong = new Set(["results", "transcript", "presentation", "press"]);
</script>

{#if filings.length}
  <ul class="filings">
    {#each filings as f, i (f.pdf ?? `${f.symbol}-${f.time}-${i}`)}
      <li>
        <time class="mono">{when(f.time)}</time>
        <div class="body">
          <div class="line">
            {#if showCompany}<a class="sym" href="/stock/{f.symbol}">{f.symbol}</a>{/if}
            <span class="chip" class:strong={strong.has(f.kind)}>{kinds[f.kind] ?? f.kind}</span>
          </div>
          <p class="subject" title={f.category}>{f.subject}</p>
          {#if showCompany}<p class="company">{f.company}</p>{/if}
        </div>
        {#if f.pdf}
          <a class="pdf" href={f.pdf} target="_blank" rel="noopener noreferrer" aria-label="Open the PDF filed by {f.company}">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 3.5h8.5L19 8v12.5H6zM14 3.5V8h5M9 13.5h6M9 16.5h4" /></svg>
            PDF{#if f.size}<small>{f.size}</small>{/if}
          </a>
        {:else}
          <span class="pdf none">No file</span>
        {/if}
      </li>
    {/each}
  </ul>
{:else}
  <div class="empty">{empty}</div>
{/if}

<style>
  .filings { list-style: none; margin: 0; padding: 0; }
  li { display: grid; grid-template-columns: 96px 1fr auto; gap: 16px; align-items: start; padding: 14px 18px; border-bottom: 1px solid var(--line); transition: background 0.12s var(--ease); }
  li:last-child { border-bottom: 0; }
  li:hover { background: var(--panel-2); }
  time { font-size: 12px; color: var(--ink-3); padding-top: 2px; white-space: nowrap; }
  .line { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .sym { font-size: 13.5px; }
  .chip.strong { background: var(--brand-soft); color: var(--brand-2); }
  .subject { margin-top: 4px; font-size: 13.5px; color: var(--ink); line-height: 1.45; overflow-wrap: anywhere; }
  .company { margin-top: 2px; font-size: 12px; color: var(--ink-3); }
  .pdf { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border: 1px solid var(--line-2); border-radius: 999px; font-size: 12.5px; font-weight: 500; white-space: nowrap; }
  .pdf:hover { border-color: var(--accent); color: var(--ink); }
  .pdf svg { fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; color: var(--down); }
  .pdf small { color: var(--ink-3); font-size: 11px; font-family: var(--mono); }
  .pdf.none { border-style: dashed; color: var(--ink-3); }
  @media (max-width: 640px) {
    li { grid-template-columns: 1fr auto; gap: 6px 12px; }
    time { grid-column: 1 / -1; }
    .pdf small { display: none; }
  }
</style>
