<script lang="ts">
  // A top-bar link that opens a dropdown, set like the Markets menu: a heavy rule, ruled columns,
  // one open at a time (a click anywhere else closes it). The label is a button; the section's own
  // front page is the first link in the panel. Phones get the same links from the Markets panel.
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import { isActive, menuActive, type NavItem } from "$lib/nav";

  let { item }: { item: NavItem } = $props();
  const menu = $derived(item.menu!);
  const id = $derived(`menu-${item.label.toLowerCase().replace(/\W+/g, "-")}`);

  let open = $state(false);
  let root: HTMLElement | undefined = $state();
  let button: HTMLButtonElement | undefined = $state();
  const current = $derived(isActive(item, page.url.pathname));

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

<div class="dd" class:wide={menu.wide} bind:this={root}>
  <button bind:this={button} class="trigger" class:current aria-expanded={open} aria-controls={id} onclick={() => (open = !open)}>
    {item.label}
    <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" class:flip={open}><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
  </button>

  {#if open}
    <div class="panel" {id} role="navigation" aria-label={item.label} style="--cols: {menu.groups.length}">
      <div class="inner">
        <a class="overview" href={menu.overview.href} class:on={menuActive(menu.overview.href, page.url)}>{menu.overview.label} <span aria-hidden="true">→</span></a>
        <div class="cols">
          {#each menu.groups as g (g.title)}
            <section>
              <h2>{g.title}</h2>
              <ul>
                {#each g.items as t (t.href)}
                  {@const on = menuActive(t.href, page.url)}
                  <li>
                    <a href={t.href} class:on aria-current={on ? "page" : undefined}>
                      <span class="label">{t.label}</span>
                      {#if t.about}<span class="about">{t.about}</span>{/if}
                    </a>
                  </li>
                {/each}
              </ul>
            </section>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .dd { position: relative; }
  /* A wide menu is placed against the whole bar (the sticky .sections), not against its label. */
  .dd.wide { position: static; }
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

  .panel {
    position: absolute; top: 100%; left: -24px; z-index: 30; width: calc(var(--cols) * 260px);
    background: var(--bg); border-top: var(--rule-heavy); border-bottom: 1px solid var(--ink); box-shadow: var(--float);
    padding: 12px 0 14px; animation: drop 0.2s var(--ease);
  }
  .wide .panel { left: 0; right: 0; width: auto; }
  .wide .inner { max-width: var(--measure); margin: 0 auto; padding: 0 32px; }
  .inner { padding: 0 18px; }
  .wide .inner { padding: 0 32px; }
  @keyframes drop { from { clip-path: inset(0 0 100% 0); } to { clip-path: inset(0 0 0 0); } }

  .overview { display: inline-flex; gap: 8px; margin-bottom: 8px; font: 800 13px var(--font); font-stretch: 78%; text-transform: uppercase; letter-spacing: 0.07em; }
  .overview:hover { text-decoration: underline; text-underline-offset: 3px; }
  .overview.on { text-decoration: underline 2px; text-underline-offset: 4px; }
  .cols { display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); }
  section { padding: 0 18px 0 0; }
  section + section { padding-left: 18px; border-left: 1px solid var(--line-2); }
  h2 { margin: 0 0 4px; padding-bottom: 6px; border-bottom: 1px solid var(--ink); font-size: 12px; font-weight: 850; font-stretch: 72%; text-transform: uppercase; letter-spacing: 0.08em; }
  ul { list-style: none; margin: 0; padding: 0; }
  li a { display: grid; gap: 1px; padding: 7px 4px; border-bottom: 1px solid var(--line); transition: background 0.12s var(--ease); }
  li a:hover { background: var(--panel-2); color: var(--ink); }
  .label { font-size: 14.5px; font-weight: 600; }
  li a.on .label { font-weight: 800; text-decoration: underline 2px; text-underline-offset: 4px; }
  .about { font: 13px/1.35 var(--serif); color: var(--ink-3); }

  /* Phones fold these links into the Markets panel. */
  @media (max-width: 860px) { .dd { display: none; } }
  @media (prefers-reduced-motion: reduce) { .panel { animation: none; } }
</style>
