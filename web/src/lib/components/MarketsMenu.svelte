<script lang="ts">
  // The one "Markets" entry in the top bar: every tool in three labelled
  // columns (Market, Flows, Companies), each with its icon. On phones the
  // columns stack and the panel spans the header's full width.
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import NavIcon from "$lib/components/NavIcon.svelte";
  import { isActive, TOP_LINKS, type NavGroup } from "$lib/nav";

  let { groups }: { groups: NavGroup[] } = $props();

  let open = $state(false);
  let root: HTMLElement | undefined = $state();
  let button: HTMLButtonElement | undefined = $state();
  const inMarkets = $derived(groups.some((g) => g.items.some((t) => isActive(t, page.url.pathname))));

  afterNavigate(() => (open = false));

  function onWindowClick(e: MouseEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape" && open) {
      open = false;
      button?.focus();
    }
  }
</script>

<svelte:window onclick={onWindowClick} onkeydown={onKey} />

<div class="markets" bind:this={root}>
  <button
    bind:this={button}
    class="trigger"
    class:current={inMarkets}
    aria-expanded={open}
    aria-controls="markets-panel"
    onclick={() => (open = !open)}
  >
    Markets
    <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" class:flip={open}><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
  </button>

  {#if open}
    <div class="panel" id="markets-panel" role="navigation" aria-label="Market tools">
      {#each groups as g (g.title)}
        <section>
          <h2>{g.title}</h2>
          <ul>
            {#each g.items as t (t.href)}
              {@const on = isActive(t, page.url.pathname)}
              <li>
                <a href={t.href} class:on aria-current={on ? "page" : undefined} title={t.about}>
                  <NavIcon d={t.icon} size={18} />
                  <span>{t.label}</span>
                </a>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
      <ul class="extra">
        {#each TOP_LINKS.filter((l) => !groups.some((g) => g.items.some((i) => i.href === l.href))) as l (l.href)}
          <li><a href={l.href} class:on={isActive(l, page.url.pathname)}><NavIcon d={l.icon} size={18} /><span>{l.label}</span></a></li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

<style>
  .markets { position: relative; }
  .trigger {
    position: relative; display: inline-flex; align-items: center; gap: 6px; height: 44px; padding: 0;
    border: 0; background: none; color: var(--ink); cursor: pointer;
    font: 800 13.5px var(--font); font-stretch: 75%; text-transform: uppercase; letter-spacing: 0.07em;
    transition: color 0.15s var(--ease);
  }
  .trigger:hover, .trigger[aria-expanded="true"] { color: var(--brand-2); }
  .trigger.current::after { content: ""; position: absolute; left: 0; right: 16px; bottom: 0; height: 3px; background: var(--ink); }
  svg { transition: transform 0.2s var(--ease); }
  svg.flip { transform: rotate(180deg); }

  /* The menu is a page index: three ruled columns under a heavy rule. */
  .panel {
    position: absolute; top: 100%; left: -24px; z-index: 30; width: 720px;
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 0;
    background: var(--bg); border-top: var(--rule-heavy); border-bottom: 1px solid var(--ink); box-shadow: var(--float);
    padding: 0 0 12px; animation: drop 0.2s var(--ease);
  }
  .panel > * { padding: 14px 18px 0; }
  .panel > * + * { border-left: 1px solid var(--line-2); }
  @keyframes drop { from { clip-path: inset(0 0 100% 0); } to { clip-path: inset(0 0 0 0); } }
  h2 { font-size: 12px; font-weight: 850; font-stretch: 72%; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink); margin: 0 0 6px; padding-bottom: 6px; border-bottom: 1px solid var(--ink); }
  ul { list-style: none; margin: 0; padding: 0; }
  a {
    position: relative; display: flex; align-items: center; gap: 10px; padding: 7px 4px; border-bottom: 1px solid var(--line);
    font-size: 14.5px; font-weight: 600; color: var(--ink); transition: background 0.12s var(--ease), color 0.12s var(--ease);
  }
  a :global(svg) { color: var(--ink-3); flex-shrink: 0; }
  a:hover { background: var(--panel-2); color: var(--ink); }
  a:hover :global(svg), a.on :global(svg) { color: var(--ink); }
  a.on { font-weight: 800; }
  a.on span { text-decoration: underline 2px; text-underline-offset: 4px; }
  .extra { display: none; }

  @media (max-width: 860px) {
    .markets { position: static; }
    .panel {
      top: 100%; left: 0; right: 0; width: auto; grid-template-columns: 1fr; gap: 0;
      max-height: calc(100dvh - 120px); overflow-y: auto;
    }
    .panel > * + * { border-left: 0; border-top: 1px solid var(--line-2); margin-top: 10px; }
    .extra { display: block; }
  }
  @media (prefers-reduced-motion: reduce) { .panel { animation: none; } }
</style>
