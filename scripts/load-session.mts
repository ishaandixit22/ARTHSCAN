// Loads one session into the live database with the API's own daily refresh, through Cloudflare's D1 HTTP API.
// A manual repair for when the scheduled runs missed a day. Uses wrangler's login. Run: npx tsx scripts/load-session.mts YYYY-MM-DD
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { runDaily } from "../api/src/jobs/daily.ts";

const token = /oauth_token\s*=\s*"([^"]+)"/.exec(readFileSync(`${homedir()}/Library/Preferences/.wrangler/config/default.toml`, "utf8"))![1];
const URL_ = "https://api.cloudflare.com/client/v4/accounts/7bf795f08d36b06d0c08060a539654e9/d1/database/bf1e0ffa-4c90-47df-ab89-aa9dd5541d9e/query";
async function q(sql: string, params: unknown[]) {
  for (let t = 0; ; t++) {
    const res = await fetch(URL_, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ sql, params }) });
    const j: any = await res.json();
    if (j.success) return j.result[0];
    if (t >= 2) throw new Error(JSON.stringify(j.errors).slice(0, 300));
    await new Promise((r) => setTimeout(r, 1500));
  }
}
class Stmt {
  constructor(public sql: string, public params: unknown[] = []) {}
  bind(...p: unknown[]) { return new Stmt(this.sql, p); }
  async all() { const r = await q(this.sql, this.params); return { results: r.results, meta: r.meta, success: true }; }
  async first(col?: string) { const r = (await q(this.sql, this.params)).results[0] ?? null; return col && r ? r[col] : r; }
  async run() { const r = await q(this.sql, this.params); return { results: r.results, meta: r.meta, success: true }; }
}
const DB = { prepare: (s: string) => new Stmt(s), batch: async (ss: Stmt[]) => { const out = []; for (const s of ss) out.push(await s.run()); return out; } };
const date = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) throw new Error("Usage: npx tsx scripts/load-session.mts YYYY-MM-DD");
const r = await runDaily({ DB } as any, { date, results: 0 });
console.log(JSON.stringify(r, null, 1));
