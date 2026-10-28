// Manage the private-beta invite list in production D1.
//
//   npm run invite -- add someone@example.com [note]
//   npm run invite -- remove someone@example.com   (cuts off their sessions, tokens and connectors)
//   npm run invite -- list
//
// Add --local to target wrangler's local D1 instead.

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const local = args.includes("--local");
const [cmd, email, ...rest] = args.filter((a) => a !== "--local");
const note = rest.join(" ");
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

let sql;
if (cmd === "add" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email ?? "")) {
  sql = `INSERT OR REPLACE INTO invites (email, note) VALUES (${q(email.toLowerCase())}, ${note ? q(note) : "NULL"})`;
} else if (cmd === "remove" && email) {
  sql = `DELETE FROM invites WHERE email = ${q(email.toLowerCase())}`;
} else if (cmd === "list") {
  sql = "SELECT email, note, created_at FROM invites ORDER BY created_at";
} else {
  console.error("usage: npm run invite -- <add|remove|list> [email] [note] [--local]");
  process.exit(1);
}

const r = spawnSync("npx", ["wrangler", "d1", "execute", "arthscan", local ? "--local" : "--remote", "--command", sql, "--json"], {
  cwd: resolve(import.meta.dirname, "../api"),
  encoding: "utf8",
});
if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  process.exit(1);
}
const [res] = JSON.parse(r.stdout);
if (cmd === "list") console.table(res.results);
else console.log(`${cmd === "add" ? "Invited" : "Removed"} ${email.toLowerCase()}.`);
