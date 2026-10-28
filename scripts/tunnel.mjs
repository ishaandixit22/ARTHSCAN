// Public test URL: opens a Cloudflare quick tunnel (https://<random>.trycloudflare.com)
// to the local site on :5173 and points PUBLIC_SITE_ORIGIN at it, so OAuth
// metadata, redirects and the docs all use the public address.
//
//   npm run tunnel        then restart `npm run dev:api` and `npm run dev:web`
//
// The URL changes every run and dies when this process stops; on exit the
// .env goes back to http://localhost:5173. Needs the cloudflared binary on
// PATH, in ./bin/cloudflared, or at $CLOUDFLARED.

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const ENV = resolve(ROOT, ".env");
const LOCAL = "http://localhost:5173";

function setEnv(key, value) {
  let text = existsSync(ENV) ? readFileSync(ENV, "utf8") : "";
  const line = `${key}=${value}`;
  text = new RegExp(`^${key}=.*$`, "m").test(text) ? text.replace(new RegExp(`^${key}=.*$`, "m"), line) : `${text.trimEnd()}\n${line}\n`;
  writeFileSync(ENV, text);
}
const getEnv = (key) => readFileSync(ENV, "utf8").match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim() ?? "";

// Dev sign-in trusts any typed email; never expose it without an access code.
if (getEnv("AUTH_DEV_LOGIN") === "true" && !getEnv("AUTH_DEV_LOGIN_CODE")) {
  setEnv("AUTH_DEV_LOGIN_CODE", randomBytes(9).toString("base64url"));
  console.log("Set AUTH_DEV_LOGIN_CODE in .env — testers need it to use the dev sign-in.");
}

const bin = process.env.CLOUDFLARED ?? (existsSync(resolve(ROOT, "bin/cloudflared")) ? resolve(ROOT, "bin/cloudflared") : "cloudflared");
const child = spawn(bin, ["tunnel", "--no-autoupdate", "--url", LOCAL], { stdio: ["ignore", "pipe", "pipe"] });
child.on("error", (err) => {
  console.error(`Could not start cloudflared (${bin}): ${err.message}`);
  process.exit(1);
});

let announced = false;
const scan = (chunk) => {
  const url = chunk.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
  if (url && !announced) {
    announced = true;
    setEnv("PUBLIC_SITE_ORIGIN", url);
    console.log(`\nPublic URL: ${url}`);
    console.log(`MCP connector URL: ${url}/mcp`);
    console.log("PUBLIC_SITE_ORIGIN updated in .env — restart the api and web dev servers now.\n");
  }
};
child.stdout.on("data", scan);
child.stderr.on("data", scan);

const restore = () => {
  setEnv("PUBLIC_SITE_ORIGIN", LOCAL);
  child.kill();
  console.log(`\nTunnel closed; PUBLIC_SITE_ORIGIN reset to ${LOCAL}. Restart the dev servers.`);
  process.exit(0);
};
process.on("SIGINT", restore);
process.on("SIGTERM", restore);
child.on("exit", (code) => {
  if (!announced) console.error(`cloudflared exited (${code}) before a URL was issued.`);
  setEnv("PUBLIC_SITE_ORIGIN", LOCAL);
  process.exit(code ?? 1);
});
