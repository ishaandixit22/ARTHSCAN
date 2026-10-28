<script lang="ts">
  import { BRAND } from "$lib/brand";

  let { data } = $props();
  const r = $derived(data.request);
</script>

<svelte:head><title>Connect {r.client_name} — {BRAND}</title></svelte:head>

<div class="page narrow">
  <div class="card card-body box">
    <h1>Connect {r.client_name} to {BRAND}?</h1>
    <p class="sub">Signed in as {data.account?.name}{data.account?.email ? ` (${data.account.email})` : ""}.</p>

    <ul>
      <li>It can call {BRAND}'s research tools for you: search, quotes, price history, financials, screener and market data.</li>
      <li>Its calls count toward your daily allowance ({data.usage?.limit ?? 50} a day on the free plan).</li>
      <li>It can't see or change your account, tokens or other connections.</li>
    </ul>

    <p class="sub">After you approve, you'll go back to <b>{r.redirect_host}</b>. You can disconnect it any time from the API tokens page.</p>

    <div class="actions">
      <form method="POST" action="?/deny"><button class="btn">Cancel</button></form>
      <form method="POST" action="?/approve"><button class="btn primary">Approve</button></form>
    </div>
  </div>
</div>

<style>
  .narrow { max-width: 520px; margin: 0 auto; }
  .box { display: grid; gap: 14px; }
  ul { margin: 0; padding-left: 20px; display: grid; gap: 6px; color: var(--ink-2); font-size: 14px; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
