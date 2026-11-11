<script lang="ts">
  let { data } = $props();
  const f = $derived(data.f);
  const rows = $derived([...f.rows].reverse() as { day: string; visits: number; signups: number; activated: number; activation_pct: number | null; wau: number; mau: number; mcp_mau: number }[]);
  const t = $derived(f.today);
</script>

<svelte:head><title>Analytics</title><meta name="robots" content="noindex" /></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>Analytics</h1>
      <p class="sub">
        As of {f.as_of} (IST). Active = a signed-in, non-internal account with a site query or an MCP call in the window.
        {f.accounts_total} accounts in all; {f.api_token_users_30d} used an API token in 30 days (not counted as active).
      </p>
    </div>
  </div>

  <div class="grid grid-2">
    {#each [["Visits today", t.visits], ["Signups today", t.signups], ["WAU", t.wau], ["MAU", t.mau], ["MCP users (30d)", t.mcp_mau]] as [label, value]}
      <section class="card"><div class="card-head"><h2>{label}</h2></div><p class="big">{value}</p></section>
    {/each}
  </div>

  <section class="card">
    <div class="card-head"><h2>By channel, last {data.days} days</h2></div>
    <table>
      <thead><tr><th>Channel</th><th>Visits</th><th>Signups</th><th>Activated</th><th>MAU</th></tr></thead>
      <tbody>{#each f.by_channel as c}<tr><td>{c.channel}</td><td>{c.visits}</td><td>{c.signups}</td><td>{c.activated}</td><td>{c.mau}</td></tr>{/each}</tbody>
    </table>
  </section>

  <section class="card">
    <div class="card-head"><h2>Daily</h2></div>
    <table>
      <thead><tr><th>Day</th><th>Visits</th><th>Signups</th><th>Activated</th><th>Activation</th><th>WAU</th><th>MAU</th><th>MCP MAU</th></tr></thead>
      <tbody>{#each rows as r}<tr><td>{r.day}</td><td>{r.visits}</td><td>{r.signups}</td><td>{r.activated}</td><td>{r.activation_pct === null ? "–" : `${r.activation_pct}%`}</td><td>{r.wau}</td><td>{r.mau}</td><td>{r.mcp_mau}</td></tr>{/each}</tbody>
    </table>
  </section>
</div>

<style>
  .big { font-size: 2rem; font-weight: 600; margin: 0.25rem 0 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: right; padding: 0.35rem 0.6rem; }
  th:first-child, td:first-child { text-align: left; }
</style>
