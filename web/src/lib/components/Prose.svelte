<script lang="ts">
  // The reading column for plain pages such as About and Terms.
  import type { Snippet } from "svelte";
  let { children }: { children: Snippet } = $props();
</script>

<section class="prose-doc">{@render children()}</section>

<style>
  .prose-doc { max-width: 720px; font: 17px/1.65 var(--serif); }
  .prose-doc :global(h2) { margin: 28px 0 8px; font: 800 22px var(--display); font-stretch: 72%; }
  .prose-doc :global(h2:first-child) { margin-top: 0; }
  .prose-doc :global(p) { margin: 0 0 14px; }
  .prose-doc :global(ul) { margin: 0 0 14px; padding-left: 20px; }
  .prose-doc :global(li) { margin-bottom: 6px; }
  .prose-doc :global(a) { text-decoration: underline; text-underline-offset: 3px; }
</style>
