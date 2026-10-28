import { apiFetch } from "$lib/server/api";
import { siteOrigin } from "$lib/server/origin";

// Tool catalog straight from the MCP server's tools/list, so these docs can't drift from what's live.
export async function load({ url }) {
  const res = await apiFetch("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  const { result } = await res.json();
  const routes = await (await apiFetch("/v1")).json();
  const pathFor = new Map(routes.endpoints.map((e: any) => [e.tool, e]));
  return {
    origin: siteOrigin(url),
    tools: result.tools.map((t: any) => ({ ...t, rest: pathFor.get(t.name) })),
  };
}
