// The one path every tool call takes, whichever surface it came from: check
// who is calling, charge the daily quota if the tool is metered, run the
// handler, log the call.

import type { Env, Principal } from "../env.js";
import { istDay } from "../lib/crypto.js";
import { coerceArgs, ToolError, TOOLS_BY_NAME } from "./tools.js";

export type CallResult =
  | { ok: true; data: unknown; usage?: { used: number; limit: number } }
  | { ok: false; status: number; code: string; message: string; usage?: { used: number; limit: number } };

export function dailyLimit(env: Env, plan: string): number {
  // Paid plans arrive in Phase 4; until then everyone is on the free limit.
  return plan === "free" ? Number(env.FREE_DAILY_QUOTA || 50) : 100_000;
}

/** Atomically takes one call from today's allowance. Returns null when exhausted. */
async function charge(env: Env, accountId: string, limit: number): Promise<number | null> {
  const day = istDay();
  await env.DB.prepare("INSERT INTO usage_daily (account_id, day, calls) VALUES (?, ?, 0) ON CONFLICT DO NOTHING").bind(accountId, day).run();
  const r = await env.DB.prepare("UPDATE usage_daily SET calls = calls + 1 WHERE account_id = ? AND day = ? AND calls < ?")
    .bind(accountId, day, limit).run();
  if (r.meta.changes === 0) return null;
  const row = await env.DB.prepare("SELECT calls FROM usage_daily WHERE account_id = ? AND day = ?").bind(accountId, day).first<{ calls: number }>();
  return row?.calls ?? limit;
}

export async function usageToday(env: Env, accountId: string): Promise<number> {
  const row = await env.DB.prepare("SELECT calls FROM usage_daily WHERE account_id = ? AND day = ?").bind(accountId, istDay()).first<{ calls: number }>();
  return row?.calls ?? 0;
}

export async function callTool(
  env: Env,
  principal: Principal | null,
  surface: "rest" | "mcp",
  name: string,
  rawArgs: Record<string, unknown>,
): Promise<CallResult> {
  const tool = TOOLS_BY_NAME.get(name);
  if (!tool) return { ok: false, status: 404, code: "E_UNKNOWN_TOOL", message: `No tool named ${name}.` };

  // Metered tools need an identity. The website's internal key is unmetered
  // so browsing the site never spends a visitor's API allowance.
  let usage: { used: number; limit: number } | undefined;
  let accountId: string | null = null;
  if (tool.metered && principal?.kind !== "internal") {
    if (!principal || principal.kind === "session" && surface === "mcp") {
      return { ok: false, status: 401, code: "E_AUTH", message: "An API token is required. Create one on the API tokens page and send it as 'Authorization: Bearer <token>'." };
    }
    accountId = principal.account.id;
    const limit = dailyLimit(env, principal.account.plan);
    const used = await charge(env, accountId, limit);
    if (used === null) {
      return { ok: false, status: 429, code: "E_QUOTA", message: `Daily limit of ${limit} calls reached. It resets at midnight IST.`, usage: { used: limit, limit } };
    }
    usage = { used, limit };
  }

  let result: CallResult;
  try {
    const args = coerceArgs(tool, rawArgs);
    result = { ok: true, data: await tool.handler(env.DB, args), usage };
  } catch (err) {
    if (err instanceof ToolError) result = { ok: false, status: err.status, code: err.code, message: err.message, usage };
    else if (err instanceof SyntaxError) result = { ok: false, status: 400, code: "E_BAD_ARGS", message: `Could not parse arguments: ${err.message}`, usage };
    else {
      console.error(`tool ${name} failed:`, err);
      result = { ok: false, status: 500, code: "E_INTERNAL", message: "Internal error.", usage };
    }
  }

  if (accountId) {
    const tokenId = principal?.kind === "token" ? principal.tokenId : null;
    await env.DB.prepare("INSERT INTO usage_log (account_id, token_id, surface, tool, ok) VALUES (?, ?, ?, ?, ?)")
      .bind(accountId, tokenId, surface, name, result.ok ? 1 : 0).run();
  }
  return result;
}
