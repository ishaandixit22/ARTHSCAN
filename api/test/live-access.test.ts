import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { migrate, SqliteDatabase } from "../src/db/sqlite.js";
import type { Env } from "../src/env.js";

const db = new SqliteDatabase(":memory:");
const forwarded: string[] = [];
// Stand-in for the Durable Object: records what reached it.
const fakeFeed: Env["LIVE_FEED"] = {
  idFromName: () => "dhan",
  get: () => ({ fetch: async (req: Request) => (forwarded.push(new URL(req.url).pathname), Response.json({ ok: true })) }),
};
const base: Env = {
  DB: db, PUBLIC_SITE_ORIGIN: "https://arthscan.me", TOKEN_PEPPER: "p", INTERNAL_API_KEY: "i", FREE_DAILY_QUOTA: "50",
  AUTH_DEV_LOGIN: "true", INVITE_ONLY: "true", LIVE_ACCESS: "owner", OWNER_EMAILS: "Owner@Example.com", LIVE_FEED: fakeFeed,
};
const req = (env: Env, path: string, init: RequestInit = {}) => app.fetch(new Request(`https://arthscan.me${path}`, init), env);

async function signIn(email: string) {
  const r = await req(base, "/api/auth/dev", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}

let owner = "";
let tester = "";
beforeAll(async () => {
  migrate(db);
  db.raw.exec("INSERT INTO invites (email) VALUES ('owner@example.com'), ('tester@example.com')");
  owner = await signIn("owner@example.com");
  tester = await signIn("tester@example.com");
});

describe("live price access", () => {
  it("owner mode: only owner emails get through", async () => {
    expect((await req(base, "/api/live/status", { headers: { cookie: owner } })).status).toBe(200);
    expect((await req(base, "/api/live/status", { headers: { cookie: tester } })).status).toBe(403);
    expect((await req(base, "/api/live/status")).status).toBe(403);
    const me = (await (await req(base, "/api/me", { headers: { cookie: tester } })).json()) as any;
    expect(me.live).toBe(false);
  });

  it("invited mode lets every signed-in user in", async () => {
    const env = { ...base, LIVE_ACCESS: "invited" };
    expect((await req(env, "/api/live/quotes?symbols=TCS", { headers: { cookie: tester } })).status).toBe(200);
    expect(forwarded.at(-1)).toBe("/snapshot");
  });

  it("is off unless LIVE_ACCESS is set", async () => {
    const env = { ...base, LIVE_ACCESS: undefined };
    expect((await req(env, "/api/live/status", { headers: { cookie: owner } })).status).toBe(403);
  });

  it("only the owner, signed in on the website, can change the Dhan token", async () => {
    const post = (cookie: string) => req({ ...base, LIVE_ACCESS: "invited" }, "/api/live/token", {
      method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ token: "x".repeat(40) }),
    });
    expect((await post(tester)).status).toBe(403);
    expect((await post(owner)).status).toBe(200);
    expect(forwarded.at(-1)).toBe("/token");
  });

  it("explains that live prices need Cloudflare when there's no feed binding", async () => {
    expect((await req({ ...base, LIVE_FEED: undefined }, "/api/live/status", { headers: { cookie: owner } })).status).toBe(503);
  });
});

describe("public live access", () => {
  it("lets signed-out visitors through and tells the website so", async () => {
    const pub = { ...base, LIVE_ACCESS: "public", INVITE_ONLY: "false" };
    expect((await req(pub, "/api/live/status")).status).toBe(200);
    const cfg = (await (await req(pub, "/api/auth/config")).json()) as any;
    expect(cfg.live_public).toBe(true);
    const off = (await (await req({ ...pub, LIVE_ACCESS: "invited" }, "/api/auth/config")).json()) as any;
    expect(off.live_public).toBe(false);
    expect((await req({ ...pub, LIVE_ACCESS: "invited" }, "/api/live/status")).status).toBe(403);
  });
});
