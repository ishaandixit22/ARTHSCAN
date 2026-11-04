<script lang="ts">
  // An issuer's logo as the IPO provider publishes it, on white in both themes because most are drawn for white.
  // Its first letter stands in when there is none or it fails to load.
  let { src, name, size = 44 }: { src?: string | null; name: string; size?: number } = $props();
  let failed = $state(false);
  $effect(() => { src; failed = false; });
</script>

<span class="logo" style="--s: {size}px" aria-hidden="true">
  {#if src && !failed}
    <img {src} alt="" width={size} height={size} loading="lazy" decoding="async" onerror={() => (failed = true)} />
  {:else}
    <i>{name.slice(0, 1)}</i>
  {/if}
</span>

<style>
  .logo { width: var(--s); height: var(--s); flex: none; display: inline-grid; place-items: center; overflow: hidden; background: #fff; border: 1px solid var(--line-2); border-radius: var(--radius-s); }
  img { width: 100%; height: 100%; object-fit: contain; padding: 8%; box-sizing: border-box; }
  i { font: 850 calc(var(--s) * 0.46) var(--display); font-stretch: 72%; font-style: normal; color: #111; }
</style>
