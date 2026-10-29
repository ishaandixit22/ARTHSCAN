<script lang="ts">
  import { page } from "$app/state";

  // A company's logo from logo.dev, looked up by ISIN; the initials stay when there is none (or no key).
  let { isin, symbol, size = 40 }: { isin?: string | null; symbol: string; size?: number } = $props();
  const key = $derived(page.data.logoKey as string | null);
  const monogram = $derived(symbol.replace(/[^A-Z]/g, "").slice(0, 2) || symbol.slice(0, 2));
  let failed = $state(false);
  $effect(() => { isin; failed = false; });
  const px = $derived(size * 2); // sharp on high-density screens
  const src = $derived(key && isin ? `https://img.logo.dev/isin/${isin}?token=${key}&size=${px}&format=webp&fallback=404` : null);
</script>

<span class="logo" style="--s: {size}px" aria-hidden="true">
  {#if src && !failed}
    <img {src} alt="" width={size} height={size} decoding="async" onerror={() => (failed = true)} />
  {:else}
    <i>{monogram}</i>
  {/if}
</span>

<style>
  .logo { width: var(--s); height: var(--s); flex: none; display: inline-grid; place-items: center; border-radius: 22%; overflow: hidden; vertical-align: middle;
    background: var(--panel); border: 1px solid var(--line); }
  img { width: 100%; height: 100%; object-fit: contain; background: #fff; padding: 12%; box-sizing: border-box; }
  i { font: 700 calc(var(--s) * 0.34) var(--font); font-style: normal; color: var(--mark); letter-spacing: -0.02em; }
</style>
