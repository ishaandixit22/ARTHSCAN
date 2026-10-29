<script lang="ts">
  import { BRAND } from "$lib/brand";
  import { cr, fetchedAt, num, pct, tone } from "$lib/format";

  let { data } = $props();
  const fundHref = (name: string) => `/mutual-funds/fund?name=${encodeURIComponent(name)}`;
  const groups = $derived(data.cat && data.funds?.data ? Object.entries(data.funds.data[data.cat]) : []);
</script>

<svelte:head><title>Mutual funds — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>Mutual funds</h1>
      <p class="sub">Top schemes in each category by the provider's ranking, with NAV and returns{#if data.funds?.fetched_at}{" · fetched "}{fetchedAt(data.funds.fetched_at)}{/if}.</p>
    </div>
    <form method="GET" class="search">
      <input name="q" value={data.q} placeholder="Find a scheme, e.g. parag parikh" aria-label="Search mutual funds" />
      <button class="btn">Search</button>
    </form>
  </div>

  {#if data.search}
    <section class="card">
      <div class="card-head"><h2>Results for “{data.q}”</h2><a href="/mutual-funds" class="sub">Back to categories</a></div>
      {#if data.search.error}
        <div class="card-body"><div class="notice">{data.search.error}</div></div>
      {:else if !data.search.data?.length}
        <div class="empty">No schemes match “{data.q}”.</div>
      {:else}
        <table>
          <thead><tr><th>Scheme</th><th class="wide-only">Type</th><th>ISIN</th></tr></thead>
          <tbody>
            {#each data.search.data as f (f.id)}
              <tr><td><a class="sym" href={fundHref(f.schemeName)}>{f.schemeName}</a></td><td class="wide-only">{f.schemeType ?? "—"}</td><td class="mono">{f.isin ?? "—"}</td></tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>
  {:else if data.funds?.error}
    <div class="notice">{data.funds.error}</div>
  {:else}
    <div class="tabs cats">
      {#each Object.keys(data.funds?.data ?? {}) as c}
        <a href="?cat={encodeURIComponent(c)}" class:active={c === data.cat} data-sveltekit-noscroll>{c}</a>
      {/each}
    </div>
    {#each groups as [sub, funds] (sub)}
      <section class="card">
        <div class="card-head"><h2>{sub}</h2></div>
        <div class="table-scroll">
          <table>
            <thead><tr><th>Scheme</th><th>NAV</th><th>1Y</th><th>3Y</th><th class="wide-only">5Y</th><th class="wide-only">AUM</th><th class="wide-only">Rating</th></tr></thead>
            <tbody>
              {#each funds as f (f.fund_name)}
                <tr>
                  <td><a class="sym fund" href={fundHref(f.fund_name)}>{f.fund_name}</a></td>
                  <td>{num(f.latest_nav)}</td>
                  <td class={tone(f["1_year_return"])}>{pct(f["1_year_return"])}</td>
                  <td class={tone(f["3_year_return"])}>{pct(f["3_year_return"])}</td>
                  <td class="wide-only {tone(f['5_year_return'])}">{pct(f["5_year_return"])}</td>
                  <td class="wide-only">{cr(f.asset_size)}</td>
                  <td class="wide-only">{f.star_rating ? "★".repeat(f.star_rating) : "—"}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/each}
  {/if}
  <p class="sub source">Returns over 1 year are annualised. Past returns don't predict future returns. Source: Indian Stock API.</p>
</div>

<style>
  .search { display: flex; gap: 8px; }
  .search input { width: 280px; }
  .cats { flex-wrap: wrap; align-self: start; }
  .fund { display: block; max-width: 420px; overflow: hidden; text-overflow: ellipsis; }
  .source { font-size: 12.5px; }
  @media (max-width: 640px) { .wide-only { display: none; } .search { width: 100%; } .search input { flex: 1; width: auto; } .fund { max-width: 170px; } }
</style>
