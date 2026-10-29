<script lang="ts">
  // Light/dark switch. The first visit follows the device; a click saves the
  // choice (static/theme.js applies it before the next page paints).
  import { onMount } from "svelte";
  import { setTheme, theme } from "$lib/theme.svelte";

  onMount(() => theme.sync());
  const next = $derived(theme.current === "dark" ? "light" : "dark");
</script>

<button class="toggle" type="button" onclick={() => setTheme(next)} aria-label="Switch to {next} mode" title="Switch to {next} mode">
  {#if theme.current === "dark"}
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.2M12 19.3v2.2M4.7 4.7l1.6 1.6M17.7 17.7l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.7 19.3l1.6-1.6M17.7 6.3l1.6-1.6" /></svg>
  {:else}
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" /></svg>
  {/if}
</button>

<style>
  .toggle {
    display: grid; place-items: center; width: 34px; height: 34px; flex-shrink: 0; padding: 0;
    border: 1px solid var(--line-2); border-radius: 999px; background: transparent; color: var(--ink-2); cursor: pointer;
    transition: color 0.15s var(--ease), border-color 0.15s var(--ease), transform 0.1s var(--ease);
  }
  .toggle:hover { color: var(--ink); border-color: var(--ink-3); }
  .toggle:active { transform: scale(0.94); }
  svg { fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
</style>
