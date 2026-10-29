<script lang="ts">
  import { BRAND } from "$lib/brand";
  import { compact, crore, date, fetchedAt, price } from "$lib/format";

  let { data } = $props();
  type Deal = { date: string; symbol: string; company: string; client: string; side: "Buy" | "Sell"; quantity: number | null; price: number | null };
  const d = $derived(data.deals);
  const value = (x: Deal) => (x.quantity && x.price ? x.quantity * x.price : null);
  const sections = $derived([
    { key: "bulk", title: "Bulk deals", about: "a client trading more than 0.5% of a company's shares in a day", rows: [...((d?.bulk ?? []) as Deal[])].sort((a, b) => (value(b) ?? 0) - (value(a) ?? 0)) },
    { key: "block", title: "Block deals", about: "single trades of ₹10 crore or more in the block-deal window", rows: [...((d?.block ?? []) as Deal[])].sort((a, b) => (value(b) ?? 0) - (value(a) ?? 0)) },
  ]);
</script>

<svelte:head><title>Bulk and block deals — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>Bulk and block deals</h1>
      <p class="sub">Large trades on NSE and who made them{#if d?.date}, for {date(d.date)}{/if}. Largest by value first.{#if d}{" "}Fetched {fetchedAt(d.fetched_at)}.{/if}</p>
    </div>
  </div>

  {#if data.error}
    <div class="notice">{data.error}</div>
  {:else}
    {#each sections as s (s.key)}
      <section class="card">
        <div class="card-head"><h2>{s.title}</h2><span class="sub">{s.about}</span></div>
        {#if s.rows.length}
          <div class="table-scroll">
            <table>
              <thead><tr><th>Stock</th><th class="left">Client</th><th class="left">Side</th><th>Quantity</th><th>Price</th><th>Value</th></tr></thead>
              <tbody>
                {#each s.rows as x, i (x.symbol + x.client + i)}
                  <tr>
                    <td><a href="/stock/{x.symbol}" class="sym">{x.symbol}</a><span class="name">{x.company}</span></td>
                    <td class="left client">{x.client}</td>
                    <td class="left {x.side === 'Buy' ? 'up' : 'down'}">{x.side}</td>
                    <td>{compact(x.quantity)}</td>
                    <td>{price(x.price)}</td>
                    <td>{crore(value(x))}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <div class="empty">No {s.title.toLowerCase()} in the latest session.</div>
        {/if}
      </section>
    {/each}
    <p class="sub small">Source: NSE bulk and block deal reports for the latest session.</p>
  {/if}
</div>

<style>
  .client { white-space: normal; min-width: 220px; font-size: 12.5px; }
  .small { font-size: 12.5px; }
</style>
