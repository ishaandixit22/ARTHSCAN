<script lang="ts">
  // One company's results-season documents as a row of links, the way a
  // results table reads: Results · Press release · Presentation · Con call ·
  // Transcript. Each opens the latest such filing's PDF on NSE; missing ones
  // stay as a dimmed label so the columns line up from row to row.
  type Doc = { time: string | null; subject: string; pdf: string | null };
  type Docs = Partial<Record<"results" | "press" | "presentation" | "concall" | "transcript" | "board", Doc[]>>;
  // `filedOnly` leaves out the dimmed placeholders, for narrow columns that list what exists.
  let { docs, only, filedOnly = false }: { docs: Docs | undefined; only?: (keyof Docs)[]; filedOnly?: boolean } = $props();

  const LABELS: [keyof Docs, string][] = [
    ["results", "Results"],
    ["press", "Press release"],
    ["presentation", "Presentation"],
    ["concall", "Con call"],
    ["transcript", "Transcript"],
  ];
  const shown = $derived(only ? LABELS.filter(([k]) => only.includes(k)) : LABELS);
  const latest = (k: keyof Docs) => (docs?.[k] ?? []).filter((d) => d.pdf).sort((a, b) => (b.time ?? "").localeCompare(a.time ?? ""))[0];
</script>

<span class="docs">
  {#each shown as [k, label]}
    {@const d = latest(k)}
    {#if d}
      <a href={d.pdf} target="_blank" rel="noopener noreferrer" title="{d.subject}{d.time ? ` · ${d.time}` : ''}">{label}</a>
    {:else if !filedOnly}
      <span class="none" aria-hidden="true">{label}</span>
    {/if}
  {/each}
</span>

<style>
  .docs { display: inline-flex; flex-wrap: wrap; gap: 6px; white-space: nowrap; }
  a, .none { display: inline-flex; align-items: center; height: 24px; padding: 0 9px; border-radius: 999px; font: 500 12px var(--font); white-space: nowrap; }
  a { border: 1px solid var(--line-2); color: var(--ink); transition: border-color 0.15s var(--ease); }
  a::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--down); margin-right: 6px; }
  a:hover { border-color: var(--accent); color: var(--ink); }
  .none { border: 1px dashed var(--line); color: var(--ink-3); opacity: 0.55; }
</style>
