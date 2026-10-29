<script lang="ts">
  import { BRAND } from "$lib/brand";
  import { date, fetchedAt, int, pct, price, tone } from "$lib/format";

  let { data } = $props();
  const ipo = $derived(data.ipo);
  const TABS = [
    { key: "active", label: "Open now" },
    { key: "upcoming", label: "Upcoming" },
    { key: "closed", label: "Awaiting listing" },
    { key: "listed", label: "Recently listed" },
  ];
  const count = (k: string) => ipo.data?.[k]?.length ?? 0;
  const rows = $derived.by(() => {
    const list = [...(ipo.data?.[data.tab] ?? [])];
    if (data.tab === "listed") list.sort((a, b) => (b.listing_date ?? "").localeCompare(a.listing_date ?? ""));
    return data.tab === "listed" ? list.slice(0, 60) : list;
  });
  const band = (r: any) =>
    !r.max_price ? "—" : r.min_price && r.min_price !== r.max_price ? `${price(r.min_price)} – ${price(r.max_price)}` : price(r.max_price);
  const dates = (r: any) => (r.bidding_start_date ? `${date(r.bidding_start_date)} – ${date(r.bidding_end_date)}` : "—");
</script>

<svelte:head><title>IPOs — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>IPOs</h1>
      <p class="sub">Mainboard and SME issues on NSE and BSE{#if ipo.fetched_at}{" · fetched "}{fetchedAt(ipo.fetched_at)}{/if}.</p>
    </div>
    {#if ipo.data}
      <div class="tabs">
        {#each TABS as t}
          <a href="?tab={t.key}" class:active={data.tab === t.key} data-sveltekit-noscroll>{t.label} <span class="n">{count(t.key)}</span></a>
        {/each}
      </div>
    {/if}
  </div>

  {#if ipo.error}
    <div class="notice">{ipo.error}</div>
  {:else if !rows.length}
    <div class="card empty">No IPOs in this list right now.</div>
  {:else}
    <section class="card">
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Issue</th><th>Price band</th><th class="wide-only">Lot</th>
              {#if data.tab === "listed"}<th>Listed</th><th>Listing price</th><th>Listing gain</th>
              {:else}<th>Bidding</th><th>Listing</th>{/if}
              {#if data.tab !== "listed"}<th class="left wide-only">Note</th>{/if}
            </tr>
          </thead>
          <tbody>
            {#each rows as r (r.symbol + r.name)}
              <tr>
                <td>
                  <span class="sym">{r.name}</span>{#if r.is_sme} <span class="chip">SME</span>{/if}
                  <span class="name">{r.symbol}{#if r.document_url} · <a href={r.document_url} target="_blank" rel="noopener noreferrer">prospectus</a>{/if}</span>
                </td>
                <td>{band(r)}</td>
                <td class="wide-only">{int(r.lot_size)}</td>
                {#if data.tab === "listed"}
                  <td>{date(r.listing_date)}</td>
                  <td>{price(r.listing_price)}</td>
                  <td class={tone(r.listing_gains)}>{pct(r.listing_gains)}</td>
                {:else}
                  <td>{dates(r)}</td>
                  <td>{date(r.listing_date)}</td>
                {/if}
                {#if data.tab !== "listed"}<td class="left wide-only note">{r.additional_text ?? ""}</td>{/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
  <p class="sub source">Source: Indian Stock API. Check the prospectus and exchange notices before applying.</p>
</div>

<style>
  .n { color: var(--ink-3); font-size: 12px; margin-left: 2px; }
  .note { color: var(--ink-3); font-size: 13px; white-space: normal; min-width: 180px; }
  .name a { text-decoration: underline; }
  .source { font-size: 12.5px; }
  @media (max-width: 640px) {
    .wide-only { display: none; }
    tbody td:first-child { white-space: normal; min-width: 140px; max-width: 170px; }
  }
</style>
