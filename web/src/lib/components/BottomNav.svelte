<script lang="ts">
  // The phone's bottom bar: the four places people go most, and More for everything else.
  import { page } from "$app/state";
  import NavIcon from "$lib/components/NavIcon.svelte";
  import { BOTTOM_NAV, ICON } from "$lib/nav";

  let { onmore, moreOpen = false }: { onmore: () => void; moreOpen?: boolean } = $props();

  const on = (t: (typeof BOTTOM_NAV)[number], path: string) =>
    t.href === "/" ? path === "/" : !!t.paths?.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p || path.startsWith(`${p}/`)));
</script>

<nav class="bottom" aria-label="Primary">
  {#each BOTTOM_NAV as t (t.href)}
    {@const current = on(t, page.url.pathname)}
    <a href={t.href} class:on={current} aria-current={current ? "page" : undefined}>
      <NavIcon d={t.icon} size={22} /><span>{t.label}</span>
    </a>
  {/each}
  <button type="button" data-early="menu" aria-haspopup="dialog" aria-expanded={moreOpen} onclick={onmore}>
    <NavIcon d={ICON.menu} size={22} /><span>More</span>
  </button>
</nav>

<style>
  .bottom { display: none; }
  @media (max-width: 860px) {
    .bottom {
      position: fixed; inset: auto 0 0 0; z-index: 25; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr));
      height: var(--chrome-bottom); padding: 0 env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
      background: var(--bg); border-top: 1px solid var(--ink); contain: layout paint;
    }
    a, button {
      position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-width: 0; height: 56px; padding: 0;
      border: 0; background: none; color: var(--ink-2); cursor: pointer; -webkit-tap-highlight-color: transparent;
    }
    span { font: 650 11px var(--font); font-stretch: 85%; letter-spacing: 0.01em; }
    a:active, button:active { background: var(--panel-2); }
    /* The current tab carries the section's heavy rule along its top edge. */
    .on { color: var(--ink); }
    .on span { font-weight: 850; }
    .on::before { content: ""; position: absolute; left: 16%; right: 16%; top: -1px; height: 3px; background: var(--ink); }
  }
  @media (max-width: 860px) and (max-height: 480px) { .bottom { display: none; } }
</style>
