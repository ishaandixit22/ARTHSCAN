<script lang="ts" module>
  // Logo.dev returns something that isn't the company's logo for these (WordPress and other site icons,
  // a blank square, another company's logo), so they keep their initials. Checked by eye on 4 Nov 2026.
  const WRONG_LOGOS = new Set([
    "INE341R01014", "INE418N01035", "INE593W01028", "INE750M01017", "INE846D01012", "INE435D01014",
    "INE286N01028", "INE1DLF01018", "INE0P8X01016", "INE0G1D01014", "INE105Y01019", "INE915K01010",
    "INE070D01027", "INE923A01015", "INE390D01011", "INE325G01010", "INE878K01010", "INE243D01012",
    "INE918N01018", "INE0J1E01027", "INE376C01038", "INE106I01010", "INE194R01017", "INE395H01011",
    "INE926K01017", "INE978G01016", "INE829A01014", "INE117Z01029", "INE348N01042",
    "INE023H01027", "INE632X01030", "INE0PK601023", "INE391D01019", "INE0N1401016", "INE0ZTO01018",
  ]);
</script>

<script lang="ts">
  import { page } from "$app/state";

  // A company's logo from logo.dev, looked up by ISIN; the initials stay when there is none (or no key).
  // `hold` keeps the initials and makes no request until it first turns false.
  let { isin, symbol, size = 40, hold = false }: { isin?: string | null; symbol: string; size?: number; hold?: boolean } = $props();
  const key = $derived(page.data.logoKey as string | null);
  const monogram = $derived(symbol.replace(/[^A-Z]/g, "").slice(0, 2) || symbol.slice(0, 2));
  let released = $state(false);
  $effect(() => { if (!hold) released = true; });
  let failed = $state(false);
  let retried = false;
  let retry: ReturnType<typeof setTimeout>;
  $effect(() => {
    isin;
    failed = false;
    retried = false;
    return () => clearTimeout(retry);
  });
  // A failure may only be Logo.dev's limit of 100 requests a minute, so try once more after that minute.
  function onFail() {
    failed = true;
    if (retried) return;
    retried = true;
    retry = setTimeout(() => (failed = false), 61_000);
  }
  const px = $derived(size * 2); // sharp on high-density screens
  const src = $derived(key && isin && !WRONG_LOGOS.has(isin) ? `https://img.logo.dev/isin/${isin}?token=${key}&size=${px}&format=webp&fallback=404` : null);
</script>

<span class="logo" style="--s: {size}px" aria-hidden="true">
  {#if src && !failed && (!hold || released)}
    <img {src} alt="" width={size} height={size} decoding="async" onerror={onFail} />
  {:else}
    <i>{monogram}</i>
  {/if}
</span>

<style>
  .logo { width: var(--s); height: var(--s); flex: none; display: inline-grid; place-items: center; border-radius: 22%; overflow: hidden; vertical-align: middle;
    background: var(--panel); border: 1px solid var(--line); }
  img { width: 100%; height: 100%; object-fit: contain; background: var(--paper-hi); padding: 12%; box-sizing: border-box; }
  i { font: 700 calc(var(--s) * 0.34) var(--font); font-style: normal; color: var(--mark); letter-spacing: -0.02em; }
</style>
