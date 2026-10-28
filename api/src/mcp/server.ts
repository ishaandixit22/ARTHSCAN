// MCP over Streamable HTTP, stateless JSON mode: every POST /mcp carries one
// JSON-RPC message and gets one JSON response (or 202 for notifications).
// No SDK and no server-held session state, so it runs as-is on Workers.
//
// Auth: every request needs a Bearer credential — a personal API token or an
// OAuth access token from /oauth/token. Without one we answer 401 with a
// WWW-Authenticate header pointing at the protected-resource metadata, which
// is what makes claude.ai / ChatGPT start the OAuth sign-in. The one
// exception is a bare tools/list, so registries and the docs page can read
// the catalog without credentials.

import { Hono, type Context } from "hono";
import type { AppEnv } from "../env.js";
import { callTool } from "../handlers/call.js";
import { TOOLS } from "../handlers/tools.js";
import { resourceMetadataUrl } from "../routes/oauth.js";

export const SERVER_INFO = { name: "arthlens", title: "Arthlens — Indian stock research", version: "0.1.0" };
const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const INSTRUCTIONS =
  "End-of-day research data for NSE-listed Indian stocks: search, quotes, price history, financials, shareholding, screener, sectors, market breadth and FII/DII flows. " +
  "Resolve company names with search_stocks first. Call guide for coverage and tips. " +
  "Answers about investments must note that this service is not a SEBI-registered research analyst or investment adviser.";

type RpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, any> };

const rpcResult = (id: RpcRequest["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id: RpcRequest["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export const mcp = new Hono<AppEnv>();

mcp.get("/", (c) => c.text("This MCP server does not offer an SSE stream; POST JSON-RPC to this URL.", 405, { Allow: "POST" }));
mcp.delete("/", (c) => c.body(null, 405));

mcp.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(rpcError(null, -32700, "Parse error"), 400);
  }

  const messages = Array.isArray(body) ? body : [body];
  const principal = c.get("principal");
  const authed = principal?.kind === "token" || principal?.kind === "internal";
  const catalogOnly = messages.every((m) => (m as RpcRequest)?.method === "tools/list");
  if (!authed && !catalogOnly) {
    const rejected = c.get("bearerRejected");
    c.header(
      "WWW-Authenticate",
      `Bearer resource_metadata="${resourceMetadataUrl(c.env)}", scope="mcp"` +
        (rejected ? ', error="invalid_token", error_description="The access token is invalid or expired"' : ""),
    );
    const id = Array.isArray(body) ? null : ((body as RpcRequest)?.id ?? null);
    return c.json(rpcError(id, -32001, rejected ? "Invalid or expired token." : "Authentication required. Sign in via OAuth or send an API token as a Bearer header."), 401);
  }

  const responses = [];
  for (const msg of messages) {
    const res = await handle(msg as RpcRequest, c);
    if (res) responses.push(res);
  }
  if (!responses.length) return c.body(null, 202);
  return c.json(Array.isArray(body) ? responses : responses[0]);
});

async function handle(msg: RpcRequest, c: Context<AppEnv>) {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return rpcError(msg?.id, -32600, "Invalid Request");
  const isNotification = msg.id === undefined;

  switch (msg.method) {
    case "initialize": {
      const requested = msg.params?.protocolVersion;
      return rpcResult(msg.id, {
        protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return rpcResult(msg.id, {});
    case "tools/list":
      return rpcResult(msg.id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { title: t.title, readOnlyHint: true, openWorldHint: false },
        })),
      });
    case "tools/call": {
      const name = msg.params?.name;
      if (typeof name !== "string") return rpcError(msg.id, -32602, "params.name is required");
      const r = await callTool(c.env, c.get("principal"), "mcp", name, msg.params?.arguments ?? {});
      if (!r.ok && r.code === "E_UNKNOWN_TOOL") return rpcError(msg.id, -32602, r.message);
      // Tool-level failures are results with isError, so the model can read and recover.
      if (!r.ok) {
        return rpcResult(msg.id, { isError: true, content: [{ type: "text", text: `${r.code}: ${r.message}` }] });
      }
      const data = r.data as Record<string, unknown>;
      return rpcResult(msg.id, {
        content: [{ type: "text", text: JSON.stringify(data) }],
        structuredContent: data,
        ...(r.usage ? { _meta: { usage: r.usage } } : {}),
      });
    }
    default:
      if (isNotification) return null; // notifications/initialized, cancelled, ...
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}
