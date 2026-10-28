<script lang="ts">
  import { enhance } from "$app/forms";
  import { BRAND } from "$lib/brand";

  let { data, form } = $props();
  // Layout data carries today's count from /api/me; it refreshes on every navigation.
  const usedToday = $derived(data.usage?.today ?? 0);
  const limit = $derived(data.usage?.limit ?? 50);
  const secret = $derived(form?.created?.secret ?? "YOUR_TOKEN");
  let copied = $state(false);

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
  const when = (s: string | null) => (s ? new Date(`${s.replace(" ", "T")}Z`).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "never");
</script>

<svelte:head><title>API tokens — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>API tokens</h1>
      <p class="sub">Signed in as {data.account?.name}{data.account?.email ? ` (${data.account.email})` : ""} · {data.account?.plan} plan</p>
    </div>
    <form method="POST" action="?/logout"><button class="btn small">Sign out</button></form>
  </div>

  <div class="grid grid-2">
    <section class="card card-body usage">
      <h2>Today's usage</h2>
      <div class="meter" aria-label="{usedToday} of {limit} calls used"><span style="width: {Math.min(100, (usedToday / limit) * 100)}%"></span></div>
      <p><b>{usedToday}</b> of {limit} calls · resets at midnight IST</p>
      <p class="sub">MCP and REST calls share one allowance. Browsing this website is free and doesn't count.</p>
    </section>

    <section class="card card-body">
      <h2>Create a token</h2>
      <form method="POST" action="?/create" use:enhance class="create">
        <input name="name" placeholder="e.g. Claude Desktop" maxlength="60" aria-label="Token name" />
        <button class="btn primary">Create token</button>
      </form>
      {#if form?.error}<p class="err">{form.error}</p>{/if}
      {#if form?.created}
        <div class="secret">
          <p><b>Copy this token now</b> — it won't be shown again.</p>
          <div class="row"><code>{form.created.secret}</code><button class="btn small" onclick={() => copy(form.created.secret)}>{copied ? "Copied" : "Copy"}</button></div>
        </div>
      {/if}
    </section>
  </div>

  <section class="card">
    <div class="card-head"><h2>Active tokens</h2><span class="sub">{data.tokens.length} of 10</span></div>
    <div class="table-scroll">
      <table>
        <thead><tr><th>Name</th><th class="left">Token</th><th>Created</th><th>Last used</th><th></th></tr></thead>
        <tbody>
          {#each data.tokens as t (t.id)}
            <tr>
              <td>{t.name}</td>
              <td class="left mono">{t.token_prefix}…</td>
              <td>{when(t.created_at)}</td>
              <td>{when(t.last_used_at)}</td>
              <td>
                <form method="POST" action="?/revoke" use:enhance>
                  <input type="hidden" name="id" value={t.id} />
                  <button class="btn small danger">Revoke</button>
                </form>
              </td>
            </tr>
          {:else}
            <tr><td colspan="5" class="empty">No tokens yet.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <section class="card">
    <div class="card-head"><h2>Connected apps</h2><span class="sub">Signed in with OAuth — no token to copy</span></div>
    <div class="table-scroll">
      <table>
        <thead><tr><th>App</th><th>Connected</th><th>Last used</th><th></th></tr></thead>
        <tbody>
          {#each data.apps as a (a.client_id)}
            <tr>
              <td>{a.client_name}</td>
              <td>{when(a.connected_at)}</td>
              <td>{when(a.last_used_at)}</td>
              <td>
                <form method="POST" action="?/disconnect" use:enhance>
                  <input type="hidden" name="client_id" value={a.client_id} />
                  <button class="btn small danger">Disconnect</button>
                </form>
              </td>
            </tr>
          {:else}
            <tr><td colspan="4" class="empty">No apps connected. Add <code>{data.origin}/mcp</code> as a custom connector in claude.ai or ChatGPT and approve it here.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <section class="card">
    <div class="card-head"><h2>Connect</h2><a class="sub" href="/developers">Full docs →</a></div>
    <div class="card-body connect">
      <h3>claude.ai, ChatGPT and other remote connectors</h3>
      <p class="sub">Add a custom connector with the URL <code>{data.origin}/mcp</code>. You'll be sent here to sign in and approve — no token needed.</p>
      <h3>Claude Code</h3>
      <pre>claude mcp add --transport http {BRAND.toLowerCase()} {data.origin}/mcp --header "Authorization: Bearer {secret}"</pre>
      <h3>Claude Desktop, Cursor and other MCP clients (JSON config)</h3>
      <pre>{JSON.stringify({ mcpServers: { [BRAND.toLowerCase()]: { type: "http", url: `${data.origin}/mcp`, headers: { Authorization: `Bearer ${secret}` } } } }, null, 2)}</pre>
      <h3>REST</h3>
      <pre>curl -H "Authorization: Bearer {secret}" {data.origin}/v1/quote/RELIANCE</pre>
    </div>
  </section>

  {#if data.history.recent.length}
    <section class="card">
      <div class="card-head"><h2>Recent calls</h2></div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Tool</th><th class="left">Via</th><th class="left">Result</th><th>When</th></tr></thead>
          <tbody>
            {#each data.history.recent as r}
              <tr><td class="mono">{r.tool}</td><td class="left">{r.surface.toUpperCase()}</td><td class="left {r.ok ? 'up' : 'down'}">{r.ok ? "ok" : "error"}</td><td>{when(r.created_at)}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
</div>

<style>
  section h2 { margin-bottom: 12px; }
  .usage p { margin-top: 8px; }
  .meter { height: 10px; border-radius: 5px; background: var(--panel-2); overflow: hidden; }
  .meter span { display: block; height: 100%; background: var(--brand); }
  .create { display: flex; gap: 8px; }
  .create input { flex: 1; }
  .secret { margin-top: 14px; padding: 12px; border-radius: 8px; background: var(--brand-soft); display: grid; gap: 8px; }
  .secret .row { display: flex; gap: 8px; align-items: center; }
  .secret code { flex: 1; overflow-x: auto; padding: 6px 8px; border-radius: 6px; background: var(--panel); }
  .connect { display: grid; gap: 10px; }
  .connect h3 { margin-top: 6px; }
  .err { color: var(--down); margin-top: 8px; }
</style>
