<script lang="ts">
  // The phone menu: every destination on the site, grouped and searchable.
  import { page } from "$app/state";
  import NavIcon from "$lib/components/NavIcon.svelte";
  import Sheet from "$lib/components/Sheet.svelte";
  import { BRAND } from "$lib/brand";
  import { drawerActive, drawerGroups, findDestinations, flatDestinations, ICON, type DrawerLink } from "$lib/nav";
  import { setTheme, theme } from "$lib/theme.svelte";

  let { live, account, onclose, onsearch }: { live: boolean; account: { name: string } | null; onclose: () => void; onsearch: (query?: string) => void } = $props();

  const groups = $derived(drawerGroups(live, !!account));
  const flat = $derived(flatDestinations(groups));
  let q = $state("");
  const found = $derived(findDestinations(flat, q));

  const within = (l: DrawerLink): boolean => drawerActive(l, page.url) || !!l.sub?.some((s) => s.items.some(within));
  // The section you're in opens by itself; on a page outside every section, Markets.
  const openTitle = $derived(groups.find((g) => g.links.some(within))?.title ?? "Markets");
  const nextTheme = $derived(theme.current === "dark" ? "light" : "dark");
</script>

{#snippet row(l: DrawerLink, showGroup = false, group = "")}
  {@const on = drawerActive(l, page.url)}
  {#if l.search}
    <button type="button" class="row" onclick={() => onsearch()}>
      {#if l.icon}<NavIcon d={l.icon} size={20} />{/if}
      <span class="txt"><b>{l.label}</b>{#if l.about}<small>{l.about}</small>{/if}</span>
    </button>
  {:else}
    <a class="row" class:on href={l.href} aria-current={on ? "page" : undefined}>
      {#if l.icon}<NavIcon d={l.icon} size={20} />{/if}
      <span class="txt"><b>{l.label}</b>{#if showGroup}<small>{group}</small>{:else if l.about}<small>{l.about}</small>{/if}</span>
    </a>
  {/if}
{/snippet}

<Sheet label="Site menu" {onclose}>
  {#snippet children(close)}
    <header class="top">
      <a class="logo" href="/" aria-label="{BRAND} home">{BRAND.toUpperCase()}</a>
      <!-- svelte-ignore a11y_autofocus -- the dialog's first stop should be Close, not a link that leaves the page. -->
      <button type="button" class="icon" aria-label="Close menu" autofocus onclick={close}><NavIcon d={ICON.close} size={22} /></button>
    </header>

    <div class="find">
      <NavIcon d={ICON.search} size={18} />
      <input type="search" bind:value={q} placeholder="Find a page or tool" aria-label="Find a page or tool" enterkeyhint="search" autocomplete="off" />
    </div>

    <nav class="scroll" aria-label="Site">
      {#if q.trim()}
        <h2 class="result-head" aria-live="polite">{found.length} {found.length === 1 ? "page" : "pages"}</h2>
        <ul>
          {#each found as d (d.label + d.href)}<li>{@render row(d, true, d.group)}</li>{/each}
        </ul>
        <button type="button" class="row stock" onclick={() => onsearch(q.trim())}>
          <NavIcon d={ICON.search} size={20} />
          <span class="txt"><b>Search stocks for “{q.trim()}”</b></span>
        </button>
      {:else}
        {#each groups as g (g.title)}
          <details class="group" open={g.title === openTitle}>
            <summary><span>{g.title}</span><NavIcon d={ICON.chevron} size={18} /></summary>
            <ul>
              {#each g.links as l (l.label)}
                <li>
                  {@render row(l)}
                  {#if l.sub}
                    <details class="more" open={l.sub.some((s) => s.items.some(within))}>
                      <summary><span>{l.label === "IPOs" ? "By stage" : "Every calculator"}</span><NavIcon d={ICON.chevron} size={16} /></summary>
                      {#each l.sub as s (s.title)}
                        {#if l.sub.length > 1 && s.title}<h3>{s.title}</h3>{/if}
                        <ul>
                          {#each s.items as i (i.href)}<li>{@render row({ ...i, about: undefined })}</li>{/each}
                        </ul>
                      {/each}
                    </details>
                  {/if}
                </li>
              {/each}
            </ul>
          </details>
        {/each}
      {/if}
    </nav>

    <footer class="foot">
      <button type="button" class="action" onclick={() => setTheme(nextTheme)}>{nextTheme === "dark" ? "Night edition" : "Day edition"}</button>
      {#if account}
        <a class="action" href="/settings/tokens" data-clarity-mask="true">{account.name}</a>
      {:else}
        <a class="action primary" href="/login">Sign in</a>
      {/if}
    </footer>
  {/snippet}
</Sheet>

<style>
  .top { display: flex; align-items: center; justify-content: space-between; height: 52px; padding: 0 4px 0 16px; flex: none; }
  .logo { font: 900 26px var(--display); font-stretch: 62%; letter-spacing: 0.01em; color: var(--ink); }
  .icon { display: grid; place-items: center; width: var(--tap); height: var(--tap); border: 0; background: none; color: var(--ink); cursor: pointer; }

  .find { position: relative; flex: none; margin: 0 16px 8px; }
  .find :global(svg) { position: absolute; left: 12px; top: 13px; color: var(--ink-2); pointer-events: none; }
  .find input { width: 100%; padding-left: 38px; border-color: var(--ink); }
  .find input::-webkit-search-cancel-button { -webkit-appearance: none; }

  .scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 16px 16px; -webkit-overflow-scrolling: touch; }
  ul { list-style: none; margin: 0; padding: 0; }

  /* Group heads are the paper's section labels on a heavy rule. */
  .group { border-top: var(--rule-heavy); margin-top: 10px; }
  .group > summary, .more > summary { display: flex; align-items: center; justify-content: space-between; cursor: pointer; list-style: none; }
  summary::-webkit-details-marker { display: none; }
  .group > summary { min-height: var(--row); font: 850 14px var(--font); font-stretch: 72%; text-transform: uppercase; letter-spacing: 0.08em; }
  summary :global(svg) { transition: transform 0.16s var(--ease); color: var(--ink-2); }
  details[open] > summary :global(svg) { transform: rotate(180deg); }

  .row { display: flex; align-items: center; gap: 12px; width: 100%; min-height: var(--row); padding: 7px 0; border: 0; border-top: 1px solid var(--line); background: none; color: var(--ink); text-align: left; cursor: pointer; font: inherit; }
  .row :global(svg) { color: var(--ink-3); }
  .row:active { background: var(--panel-2); }
  .txt { display: grid; min-width: 0; }
  .txt b { font-size: 15.5px; font-weight: 600; line-height: 1.25; }
  .txt small { font: 13px/1.3 var(--serif); color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* The current page: heavier, with an ink bar down its edge. */
  .row.on { position: relative; }
  .row.on b { font-weight: 850; }
  .row.on :global(svg) { color: var(--ink); }
  .row.on::before { content: ""; position: absolute; left: -16px; top: 0; bottom: 0; width: 4px; background: var(--ink); }

  .more { margin: 0 0 4px 32px; }
  .more > summary { min-height: 40px; font-size: 13.5px; font-weight: 650; color: var(--ink-2); border-top: 1px solid var(--line); }
  .more h3 { margin: 10px 0 4px; font-size: 12px; font-weight: 800; font-stretch: 75%; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-2); }
  .more .row { min-height: 42px; }
  .more .row b { font-size: 14.5px; font-weight: 500; }

  .result-head { margin: 8px 0 4px; font-size: 12px; font-weight: 800; font-stretch: 75%; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-2); }
  .stock { border-top: 1.5px solid var(--ink); }

  .foot { flex: none; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--ink); }
  .action { display: flex; align-items: center; justify-content: center; min-height: var(--tap); padding: 0 10px; border: 1.5px solid var(--ink); border-radius: var(--radius-s); background: none; color: var(--ink); font: 750 13px var(--font); font-stretch: 85%; text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .action.primary { background: var(--ink); color: var(--on-ink); }
</style>
