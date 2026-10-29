<script lang="ts">
  import { BRAND } from "$lib/brand";
  import { dateTime, fetchedAt } from "$lib/format";

  let { data } = $props();
  const n = $derived(data.news);
  // Feeds escape some entities twice ("S&amp;P"); undo the common ones for display.
  const clean = (s: string | null | undefined) => (s ?? "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
</script>

<svelte:head><title>Market news — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>News</h1>
      <p class="sub">Latest Indian market and business headlines. Updated every 15 minutes{#if n.fetched_at}{" · fetched "}{fetchedAt(n.fetched_at)}{/if}.</p>
    </div>
  </div>

  {#if n.error}
    <div class="notice">{n.error}</div>
  {:else if !n.data?.length}
    <div class="card empty">No news right now.</div>
  {:else}
    <section class="card list">
      {#each n.data as item (item.url)}
        <article>
          <div class="text">
            <a class="title" href={item.url} target="_blank" rel="noopener noreferrer">{clean(item.title)}</a>
            {#if item.summary}<p class="summary">{clean(item.summary)}</p>{/if}
            <p class="meta">
              {item.source ?? "—"} · {dateTime(item.pub_date)}
              {#each item.topics ?? [] as t}<span class="chip">{t}</span>{/each}
            </p>
          </div>
          {#if item.image_url}<img src={item.image_url} alt="" loading="lazy" referrerpolicy="no-referrer" />{/if}
        </article>
      {/each}
    </section>
  {/if}
  <p class="sub source">Headlines link to the original publisher. Source: Indian Stock API.</p>
</div>

<style>
  .list article { display: flex; gap: 16px; padding: 16px; border-bottom: 1px solid var(--line); }
  .list article:last-child { border-bottom: 0; }
  .text { display: grid; gap: 6px; min-width: 0; flex: 1; }
  .title { font-weight: 600; font-size: 15.5px; line-height: 1.35; }
  .summary { color: var(--ink-2); font-size: 14px; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .meta { color: var(--ink-3); font-size: 12.5px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  img { width: 132px; height: 88px; object-fit: cover; border-radius: 8px; flex-shrink: 0; background: var(--panel-2); }
  .source { font-size: 12.5px; }
  @media (max-width: 640px) { img { width: 88px; height: 66px; } .summary { -webkit-line-clamp: 2; line-clamp: 2; } }
</style>
