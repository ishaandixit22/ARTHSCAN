<script lang="ts">
  // News about this stock: one lead story, then a row of smaller ones, each opening at its publisher.
  let { news, name, loading }: { news: any[]; name: string; loading: boolean } = $props();
  const lead = $derived(news[0]);
  const rest = $derived(news.slice(1));
  const when = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso.replace(/\+0000$/, "Z"));
    if (Number.isNaN(+d)) return "";
    return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
  };
  const host = (u: string) => {
    try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
  };
  /** A picture that fails to load leaves the story whole rather than a broken frame. */
  const drop = (e: Event) => ((e.currentTarget as HTMLElement).style.display = "none");
</script>

{#if lead}
  <div class="news">
    <a class="lead" href={lead.url} target="_blank" rel="noopener noreferrer">
      {#if lead.image}<img src={lead.image} alt="" loading="lazy" referrerpolicy="no-referrer" onerror={drop} />{/if}
      <div>
        <h3>{lead.headline}</h3>
        {#if lead.summary}<p>{lead.summary}</p>{/if}
        <small>{when(lead.date)} · {host(lead.url)}</small>
      </div>
    </a>
    {#if rest.length}
      <div class="more">
        {#each rest as n}
          <a href={n.url} target="_blank" rel="noopener noreferrer">
            {#if n.image}<img src={n.image} alt="" loading="lazy" referrerpolicy="no-referrer" onerror={drop} />{/if}
            <h4>{n.headline}</h4>
            <small>{when(n.date)}</small>
          </a>
        {/each}
      </div>
    {/if}
  </div>
{:else}
  <div class="empty">{loading ? `Loading news about ${name}…` : `No recent news about ${name} from our news source.`}</div>
{/if}

<style>
  .news { display: grid; gap: 24px; }
  a { color: inherit; text-decoration: none; }
  a:hover h3, a:hover h4 { text-decoration: underline; text-underline-offset: 3px; }
  a:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
  img { display: block; width: 100%; object-fit: cover; background: var(--panel-2); }
  .lead { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: 24px; align-items: start; }
  .lead img { aspect-ratio: 16 / 9; }
  .lead h3 { margin: 0; font: 800 clamp(24px, 3vw, 36px)/1.1 var(--display); font-stretch: 70%; text-wrap: balance; }
  .lead p { margin: 10px 0 0; font: 16px/1.5 var(--serif); color: var(--ink-2); max-width: 65ch; }
  small { display: block; margin-top: 8px; color: var(--ink-3); font-size: 12.5px; }
  .more { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px 20px; padding-top: 18px; border-top: var(--rule); }
  .more img { aspect-ratio: 16 / 9; margin-bottom: 8px; }
  h4 { margin: 0; font-size: 15px; font-weight: 600; line-height: 1.35; }
  @media (max-width: 860px) {
    .lead { grid-template-columns: minmax(0, 1fr); gap: 12px; }
    .more { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 480px) { .more { grid-template-columns: minmax(0, 1fr); } }
</style>
