<script lang="ts">
  // The one "Markets" entry in the top bar. Opens a panel listing every market
  // tool with a line on what it answers; on phones the panel also carries the
  // research links that the top bar has no room for.
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import NavIcon from "$lib/components/NavIcon.svelte";
  import { isActive, RESEARCH, type NavItem } from "$lib/nav";

  let { tools }: { tools: NavItem[] } = $props();

  let open = $state(false);
  let root: HTMLElement | undefined = $state();
  let button: HTMLButtonElement | undefined = $state();
  const inMarkets = $derived(tools.some((t) => isActive(t, page.url.pathname)));

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
      <ul class="tools">
        {#each tools as t (t.href)}
          {@const on = isActive(t, page.url.pathname)}
          <li>
            <a href={t.href} class:on aria-current={on ? "page" : undefined}>
              <span class="icon"><NavIcon d={t.icon} size={18} /></span>
              <span class="label">{t.label}</span>
              <span class="about">{t.about}</span>
            </a>
          </li>
        {/each}
      </ul>
      <ul class="research">
        {#each RESEARCH as r (r.href)}
          <li><a href={r.href} class:on={isActive(r, page.url.pathname)}><NavIcon d={r.icon} size={15} />{r.label}</a></li>
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
    position: absolute; top: calc(100% + 1px); left: -18px; z-index: 30; width: 780px;
    background: var(--panel); border: 1px solid var(--line-2); border-radius: var(--radius); box-shadow: var(--float);
    padding: 10px; animation: drop 0.18s var(--ease);
  }
  @keyframes drop { from { opacity: 0; transform: translateY(-6px); } }
  ul { list-style: none; margin: 0; padding: 0; }
  .tools { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; }
  .tools a {
    position: relative; display: grid; grid-template-columns: 18px 1fr; column-gap: 12px; row-gap: 1px; align-items: start;
    padding: 11px 12px; border-radius: 4px; transition: background 0.12s var(--ease);
  }
  .tools a:hover { background: var(--panel-2); color: inherit; }
  .icon { grid-row: span 2; color: var(--ink-3); padding-top: 1px; transition: color 0.15s var(--ease), transform 0.2s var(--ease); }
  .tools a:hover .icon { color: var(--mark); transform: translateY(-1px); }
  .tools a.on .icon { color: var(--mark); }
  .label { font-size: 13.5px; font-weight: 600; color: var(--ink); justify-self: start; position: relative; }
  .about { font-size: 12px; color: var(--ink-3); }
  .tools a.on .label::after { content: ""; position: absolute; left: 0; right: 0; bottom: -2px; height: 1px; background: var(--accent); }
  .research { display: none; }

  @media (max-width: 860px) {
    /* The panel spans the sticky header's full width, just under it. */
    .markets { position: static; }
    .panel { top: 100%; left: 0; right: 0; width: auto; border-radius: 0; border-width: 1px 0; max-height: calc(100dvh - 120px); overflow-y: auto; }
    .tools { grid-template-columns: 1fr; }
    .research { display: flex; flex-wrap: wrap; gap: 4px 20px; padding: 12px 12px 6px; margin-top: 8px; border-top: 1px solid var(--line); }
    .research a { font-size: 13.5px; color: var(--ink-2); padding: 6px 0; display: inline-flex; align-items: center; gap: 7px; }
    .research a.on { color: var(--ink); }
  }
  @media (prefers-reduced-motion: reduce) { .panel { animation: none; } }
</style>
