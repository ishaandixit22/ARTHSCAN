<script lang="ts">
  import { goto } from "$app/navigation";
  import { BRAND } from "$lib/brand";
  import { crore, num, pct, price, tone } from "$lib/format";

  let { data } = $props();

  type Row = { field: string; op: string; value: string };
  let rows = $state<Row[]>([]);
  let sector = $state("");
  let sort = $state("turnover");
  let order = $state("desc");
  let above200 = $state(false);

  // Re-sync the form whenever the URL (and so the loaded query) changes.
  $effect(() => {
    const q = data.query;
    rows = q.filters.length ? q.filters.map((f: any) => ({ field: f.field, op: f.op, value: String(f.value) })) : [{ field: "ret_1y", op: "gt", value: "" }];
    sector = q.sector ?? "";
    sort = q.sort;
    order = q.order;
    above200 = q.above200;
  });

  const OPS = [["gt", ">"], ["gte", "≥"], ["lt", "<"], ["lte", "≤"], ["eq", "="]];
  const PRESETS = [
    { label: "Near 52-week high", f: ["pct_from_high:gte:-5", "turnover:gt:100000000"], sort: "ret_3m" },
    { label: "1Y winners, liquid", f: ["ret_1y:gt:50", "turnover:gt:500000000"], sort: "ret_1y" },
    { label: "Beaten down, above 200D", f: ["pct_from_high:lt:-30", "turnover:gt:100000000"], above200: true, sort: "ret_1m" },
    { label: "Low volatility", f: ["volatility_1y:lt:22", "turnover:gt:500000000"], sort: "volatility_1y", order: "asc" },
  ];

  function href(p: { f: string[]; sector?: string; sort?: string; order?: string; above200?: boolean; page?: number }) {
    const u = new URLSearchParams();
    for (const f of p.f) u.append("f", f);
    if (p.sector) u.set("sector", p.sector);
    if (p.sort) u.set("sort", p.sort);
    if (p.order) u.set("order", p.order);
    if (p.above200) u.set("above200", "1");
    if (p.page && p.page > 1) u.set("page", String(p.page));
    return `/screener?${u}`;
  }

  const current = () => ({
    f: rows.filter((r) => r.value !== "").map((r) => `${r.field}:${r.op}:${r.value}`),
    sector, sort, order, above200,
  });

  function run(e?: Event) {
    e?.preventDefault();
    goto(href(current()), { keepFocus: true, noScroll: true });
  }

  function sortBy(field: string) {
    order = sort === field && order === "desc" ? "asc" : "desc";
    sort = field;
    run();
  }

  const fieldLabel = (k: string) => data.fields.find((f: any) => f.key === k)?.label ?? k;
  const pages = $derived(Math.max(1, Math.ceil(data.result.total / 50)));
  const COLS = [
    ["close", "Price"], ["change_pct", "Day"], ["ret_1m", "1M"], ["ret_1y", "1Y"],
    ["pct_from_high", "From high"], ["volatility_1y", "Vol."], ["pe", "P/E"], ["turnover", "Turnover"],
  ];
</script>

<svelte:head><title>Stock screener — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>Screener</h1>
      <p class="sub">Filter every NSE stock by price, returns, 52-week range, liquidity and volatility.</p>
    </div>
  </div>

  <div class="presets">
    {#each PRESETS as p}<a class="chip" href={href(p)}>{p.label}</a>{/each}
  </div>

  <form class="card card-body filters" onsubmit={run}>
    {#each rows as row, i}
      <div class="frow">
        <select bind:value={row.field} aria-label="Field">
          {#each data.fields as f}<option value={f.key}>{f.label} ({f.unit})</option>{/each}
        </select>
        <select bind:value={row.op} aria-label="Operator" class="op">
          {#each OPS as [v, l]}<option value={v}>{l}</option>{/each}
        </select>
        <input type="number" step="any" bind:value={row.value} placeholder="value" aria-label="Value" />
        <button type="button" class="btn small" aria-label="Remove filter" onclick={() => (rows = rows.filter((_, j) => j !== i))}>✕</button>
      </div>
    {/each}
    <div class="frow">
      <button type="button" class="btn small" onclick={() => (rows = [...rows, { field: "close", op: "lt", value: "" }])}>+ Add filter</button>
      <select bind:value={sector} aria-label="Sector">
        <option value="">All sectors</option>
        {#each data.sectors as s}<option value={s}>{s}</option>{/each}
      </select>
      <label class="check"><input type="checkbox" bind:checked={above200} /> Above 200-day average</label>
      <button class="btn primary" type="submit">Run screen</button>
    </div>
    <p class="sub hint">Turnover and volume are in rupees / shares — ₹1 Cr = 10000000. Returns and distances are in %.</p>
  </form>

  <section class="card">
    <div class="card-head">
      <h2>{data.result.total} stocks</h2>
      <span class="sub">sorted by {fieldLabel(data.query.sort)} {data.query.order === "asc" ? "↑" : "↓"}</span>
    </div>
    {#if data.result.error}<div class="notice">{data.result.error}</div>{/if}
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Stock</th>
            {#each COLS as [k, l]}
              <th><button class="sort" class:on={data.query.sort === k} onclick={() => sortBy(k)}>{l}{data.query.sort === k ? (data.query.order === "asc" ? " ↑" : " ↓") : ""}</button></th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each data.result.results as r (r.symbol)}
            <tr>
              <td><a href="/stock/{r.symbol}" class="sym">{r.symbol}</a><span class="name">{r.name}</span></td>
              <td>{price(r.close)}</td>
              <td class={tone(r.change_pct)}>{pct(r.change_pct)}</td>
              <td class={tone(r.ret_1m)}>{pct(r.ret_1m)}</td>
              <td class={tone(r.ret_1y)}>{pct(r.ret_1y)}</td>
              <td class={tone(r.pct_from_high)}>{pct(r.pct_from_high)}</td>
              <td>{pct(r.volatility_1y, false)}</td>
              <td>{num(r.pe, 1)}</td>
              <td>{crore(r.turnover)}</td>
            </tr>
          {:else}
            <tr><td colspan="9" class="empty">No stocks match these filters.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  {#if pages > 1}
    <div class="pager">
      {#if data.query.page > 1}<a class="btn small" href={href({ ...current(), page: data.query.page - 1 })}>← Previous</a>{/if}
      <span class="sub">Page {data.query.page} of {pages}</span>
      {#if data.query.page < pages}<a class="btn small" href={href({ ...current(), page: data.query.page + 1 })}>Next →</a>{/if}
    </div>
  {/if}
</div>

<style>
  .presets { display: flex; gap: 8px; flex-wrap: wrap; }
  .presets .chip { padding: 6px 12px; font-size: 13px; border: 1px solid var(--line); background: var(--panel); }
  .presets .chip:hover { border-color: var(--brand-2); }
  .filters { display: grid; gap: 10px; }
  .frow { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .frow select:first-child { min-width: 220px; }
  .op { width: 64px; }
  .frow input[type="number"] { width: 140px; }
  .check { display: flex; gap: 6px; align-items: center; font-size: 14px; color: var(--ink-2); }
  .check input { height: auto; }
  .hint { font-size: 12.5px; }
  .sort { border: 0; background: none; color: inherit; font: inherit; cursor: pointer; padding: 0; }
  .sort.on { color: var(--ink); font-weight: 600; }
  .pager { display: flex; gap: 12px; align-items: center; justify-content: center; }
  .notice { margin: 12px 16px; }
</style>
