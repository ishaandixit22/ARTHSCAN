<script lang="ts">
  // One outline icon from lib/nav.ts, drawn in the current text colour.
  let { d, size = 16 }: { d: string; size?: number } = $props();
</script>

<svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path {d} /></svg>

<style>
  svg { flex-shrink: 0; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
</style>
