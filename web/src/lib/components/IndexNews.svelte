<script lang="ts">
  import { dateTime } from "$lib/format";

  type Item = { title: string; url: string; summary: string | null; source: string | null; date: string | null; image: string | null; tag: string; symbol: string | null };
  let { slug, label }: { slug: string; label: string } = $props();

  let items = $state<Item[] | null>(null);
  let companies = $state<string[]>([]);
  let failed = $state(false);

  $effect(() => {
    const s = slug;
    items = null;
    failed = false;
    fetch(`/indices/${s}/news`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((r) => {
        if (s !== slug) return;
        if (!r) { failed = true; items = []; return; }
        items = r.items ?? [];
        companies = r.companies ?? [];
      });
  });

  const clean = (s: string | null | undefined) => (s ?? "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  // Provider dates are UTC ("…Z"); show them in IST.
  const when = (s: string | null) => {
    if (!s) return "";
    const t = Date.parse(s);
    return Number.isFinite(t) ? dateTime(new Date(t + 5.5 * 3600_000).toISOString().slice(0, 16)) : "";
  };
</script>

{#if items === null}
  <ul class="list" aria-busy="true">
    {#each [0, 1, 2, 3] as i (i)}<li class="ghost"><span></span><span></span></li>{/each}
  </ul>
{:else if !items.length}
  <p class="empty">
    {failed ? "News isn't available right now." : `No recent headlines about the ${label} or its largest companies.`}
    <a href="/news">Market news ›</a>
  </p>
{:else}
  {#if companies.length}<p class="sub">Recent headlines about the {label}'s largest companies ({companies.join(", ")}) and the index itself, newest first.</p>{/if}
  <ul class="list">
    {#each items as n (n.url)}
      <li>
        <div class="txt">
          <a class="title" href={n.url} target="_blank" rel="noopener noreferrer">{clean(n.title)}</a>
          {#if n.summary}<p class="summary">{clean(n.summary)}</p>{/if}
          <p class="meta">
            {#if n.symbol}<a class="tag" href="/stock/{n.symbol}">{n.tag}</a>{:else}<span class="tag">{n.tag}</span>{/if}
            {n.source ?? ""}{n.source && n.date ? " · " : ""}{when(n.date)}
          </p>
        </div>
        {#if n.image}<img src={n.image} alt="" loading="lazy" referrerpolicy="no-referrer" />{/if}
      </li>
    {/each}
  </ul>
  <a class="more" href="/news">All market news ›</a>
{/if}

<style>
  .sub { margin: 0 0 4px; font-size: 13.5px; color: var(--ink-3); }
  .list { list-style: none; margin: 0; padding: 0; }
  .list li { display: flex; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--line); }
  .txt { flex: 1; min-width: 0; }
  .title { font-weight: 650; font-size: 15.5px; line-height: 1.35; color: var(--ink); }
  .title:hover { text-decoration: underline; text-underline-offset: 3px; }
  .summary { margin: 5px 0 0; font-family: var(--serif); font-size: 14.5px; line-height: 1.5; color: var(--ink-2); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .meta { margin: 6px 0 0; font-size: 12.5px; color: var(--ink-3); }
  .tag { display: inline-block; margin-right: 6px; padding: 1px 7px; border: 1px solid var(--line-2); border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; color: var(--ink-2); }
  a.tag:hover { border-color: var(--ink); color: var(--ink); }
  img { width: 120px; height: 80px; object-fit: cover; border-radius: 6px; flex: none; background: var(--line); }
  .ghost span { display: block; height: 14px; border-radius: 4px; background: var(--line); }
  .ghost { flex-direction: column; gap: 8px; }
  .ghost span:first-child { width: 80%; }
  .ghost span:last-child { width: 50%; }
  .more { display: inline-block; margin-top: 12px; font-weight: 700; font-size: 14px; color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
  .empty { color: var(--ink-3); }
  @media (max-width: 640px) { img { display: none; } }
</style>
