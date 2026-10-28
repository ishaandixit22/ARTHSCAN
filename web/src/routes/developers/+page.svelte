<script lang="ts">
  import { BRAND } from "$lib/brand";

  let { data } = $props();
  const id = BRAND.toLowerCase();
</script>

<svelte:head><title>API & MCP — {BRAND}</title></svelte:head>

<div class="page">
  <div class="page-head">
    <div>
      <h1>API & MCP server</h1>
      <p class="sub">Every dataset on this site is available to your AI assistant over MCP and to your code over REST — same tools, same token, same daily quota.</p>
    </div>
    <a class="btn primary" href="/settings/tokens">Get a token</a>
  </div>

  <div class="grid grid-3">
    <div class="card card-body"><h3>1. Sign in</h3><p class="sub">Remote connectors sign you in themselves. For code and local clients, create a token on the <a href="/settings/tokens">API tokens</a> page. Free plan: 50 calls a day.</p></div>
    <div class="card card-body"><h3>2. Connect</h3><p class="sub">Add <code>{data.origin}/mcp</code> to claude.ai or ChatGPT and approve the sign-in, or give Claude Code / Cursor your token as a Bearer header.</p></div>
    <div class="card card-body"><h3>3. Ask</h3><p class="sub">“Which IT stocks are within 5% of their 52-week high?” — the assistant picks the tools.</p></div>
  </div>

  <section class="card">
    <div class="card-head"><h2>Connect your client</h2></div>
    <div class="card-body setup">
      <h3>claude.ai, ChatGPT and other remote connectors (OAuth)</h3>
      <p class="sub">Add a custom connector with the URL <code>{data.origin}/mcp</code>. The client discovers the sign-in from
        <code>/.well-known/oauth-protected-resource/mcp</code>, sends you here to approve, and refreshes its own access. No token to paste.</p>
      <h3>Claude Code (token)</h3>
      <pre>claude mcp add --transport http {id} {data.origin}/mcp --header "Authorization: Bearer YOUR_TOKEN"</pre>
      <h3>JSON config (Claude Desktop, Cursor, Windsurf, VS Code…)</h3>
      <pre>{JSON.stringify({ mcpServers: { [id]: { type: "http", url: `${data.origin}/mcp`, headers: { Authorization: "Bearer YOUR_TOKEN" } } } }, null, 2)}</pre>
      <h3>REST</h3>
      <pre>curl -H "Authorization: Bearer YOUR_TOKEN" "{data.origin}/v1/search?query=infosys"

curl -X POST -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" \
  -d '{JSON.stringify({ filters: [{ field: "ret_1y", op: "gt", value: 30 }], sort: "ret_1y", limit: 10 })}' \
  {data.origin}/v1/screener</pre>
      <p class="sub">
        Responses are <code>{"{ ok: true, data }"}</code> or <code>{"{ ok: false, error: { code, message } }"}</code>.
        Metered calls return <code>X-RateLimit-Limit</code> and <code>X-RateLimit-Remaining</code>; over the limit you get HTTP 429 until midnight IST.
      </p>
    </div>
  </section>

  <section class="card">
    <div class="card-head"><h2>Tools ({data.tools.length})</h2><span class="sub">MCP tool name · REST route</span></div>
    {#each data.tools as t}
      <details class="tool">
        <summary>
          <code class="name">{t.name}</code>
          <span class="route mono">{t.rest?.method} /v1{t.rest?.path.replace(/^\/v1/, "")}</span>
          {#if !t.rest?.metered}<span class="chip">free</span>{/if}
        </summary>
        <p>{t.description}</p>
        {#if Object.keys(t.inputSchema.properties).length}
          <table>
            <thead><tr><th>Argument</th><th class="left">Type</th><th class="left">Description</th></tr></thead>
            <tbody>
              {#each Object.entries(t.inputSchema.properties) as [k, v]}
                <tr>
                  <td class="mono">{k}{t.inputSchema.required?.includes(k) ? " *" : ""}</td>
                  <td class="left mono">{(v as any).type}{(v as any).enum ? ` (${(v as any).enum.slice(0, 6).join(" | ")}${(v as any).enum.length > 6 ? " …" : ""})` : ""}</td>
                  <td class="left desc">{(v as any).description ?? ""}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </details>
    {/each}
  </section>
</div>

<style>
  .setup { display: grid; gap: 10px; }
  .tool { border-top: 1px solid var(--line); padding: 12px 16px; }
  .tool summary { display: flex; gap: 12px; align-items: center; cursor: pointer; flex-wrap: wrap; }
  .tool .name { font-weight: 600; }
  .route { color: var(--ink-3); font-size: 13px; }
  .tool p { margin: 10px 0; color: var(--ink-2); font-size: 14px; }
  .desc { white-space: normal; color: var(--ink-2); min-width: 260px; }
</style>
