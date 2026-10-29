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
    position: relative; display: inline-flex; align-items: center; gap: 6px; height: 56px; padding: 0;
    border: 0; background: none; color: var(--ink-2); font: 500 13.5px var(--font); cursor: pointer;
    transition: color 0.15s var(--ease);
  }
  .trigger:hover, .trigger[aria-expanded="true"] { color: var(--ink); }
  .trigger.current { color: var(--ink); }
  .trigger.current::after { content: ""; position: absolute; left: 0; right: 16px; bottom: -1px; height: 1px; background: var(--accent); }
  svg { transition: transform 0.2s var(--ease); }
  svg.flip { transform: rotate(180deg); }

  .panel {
    position: absolute; top: calc(100% + 1px); left: -22px; z-index: 30; width: 680px;
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 24px;
    background: var(--panel); border: 1px solid var(--line-2); border-radius: 10px; box-shadow: var(--float);
    padding: 20px 22px 16px; animation: drop 0.18s var(--ease);
  }
  @keyframes drop { from { opacity: 0; transform: translateY(-6px); } }
  h2 { font-size: 12.5px; font-weight: 600; color: var(--ink-3); margin: 0 0 6px 10px; letter-spacing: 0; }
  ul { list-style: none; margin: 0; padding: 0; }
  a {
    position: relative; display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 6px;
    font-size: 14px; color: var(--ink); transition: background 0.12s var(--ease);
  }
  a :global(svg) { color: var(--ink-3); transition: color 0.15s var(--ease), transform 0.2s var(--ease); }
  a:hover { background: var(--panel-2); color: var(--ink); }
  a:hover :global(svg) { color: var(--mark); transform: translateY(-1px); }
  a.on :global(svg) { color: var(--mark); }
  a.on span { position: relative; }
  a.on span::after { content: ""; position: absolute; left: 0; right: 0; bottom: -3px; height: 1px; background: var(--accent); }
  .extra { display: none; }

  @media (max-width: 860px) {
    /* The panel spans the sticky header's full width, just under it. */
    .markets { position: static; }
    .panel {
      top: 100%; left: 0; right: 0; width: auto; grid-template-columns: 1fr; gap: 14px;
      border-radius: 0; border-width: 1px 0; max-height: calc(100dvh - 120px); overflow-y: auto;
    }
    .extra { display: block; border-top: 1px solid var(--line); padding-top: 10px; }
  }
  @media (prefers-reduced-motion: reduce) { .panel { animation: none; } }
</style>
