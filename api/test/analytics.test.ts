import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { migrate, SqliteDatabase } from "../src/db/sqlite.js";
import type { Env } from "../src/env.js";
import { classifyTouch } from "../src/lib/analytics.js";

const db = new SqliteDatabase(":memory:");
const env: Env = { DB: db, PUBLIC_SITE_ORIGIN: "https://arthscan.me", TOKEN_PEPPER: "t", INTERNAL_API_KEY: "k", FREE_DAILY_QUOTA: "50", AUTH_DEV_LOGIN: "true", OWNER_EMAILS: "boss@arthscan.me" };
const req = (path: string, init: RequestInit = {}) => app.fetch(new Request(`http://x${path}`, init), env);
const json = (b: unknown, h: Record<string, string> = {}) => ({ method: "POST", headers: { "content-type": "application/json", ...h }, body: JSON.stringify(b) });
const internal = { "x-internal-key": "k" };

describe("classifyTouch", () => {
  it("names the channel from UTM tags or the referrer", () => {
    expect(classifyTouch({ utm_source: "newsletter", utm_medium: "email" }).channel).toBe("email");
    expect(classifyTouch({ ref: "www.google.com" }).channel).toBe("search");
    expect(classifyTouch({ ref: "t.co" }).channel).toBe("social");
    expect(classifyTouch({ ref: "arthscan.me" }).channel).toBe("direct");
    expect(classifyTouch({}).channel).toBe("direct");
  });
});

describe("funnel", () => {
  let loginCookie = "";
  beforeAll(() => migrate(db));

  it("counts visits, attributes the signup, and counts a site query and an MCP call as active", async () => {
    const ua = { "user-agent": "Mozilla/5.0 (iPhone)" };
    expect((await req("/api/analytics/visit", json({ utm_source: "x", utm_medium: "social" }, ua))).status).toBe(204);
    expect((await req("/api/analytics/visit", json({}, { "user-agent": "Googlebot/2.1" }))).status).toBe(204);
    const visit = await req("/api/analytics/visit", json({ ref: "news.ycombinator.com" }, ua));
    expect(visit.headers.get("set-cookie")).toContain("al_src=");

    // First-touch cookie from the first visit decides the channel.
    const src = encodeURIComponent(JSON.stringify({ channel: "social", source: "x", medium: "social", campaign: null }));
    const login = await req("/api/auth/dev", json({ email: "user@example.com" }, { cookie: `al_src=${src}` }));
    loginCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
    await req("/api/auth/dev", json({ email: "boss@arthscan.me" }));

    const me = (await (await req("/api/me", { headers: { cookie: loginCookie } })).json()) as any;
    const id = (me.data ?? me).account.id;
    await req("/api/analytics/query", json({ account_id: id, group: "screener" }, internal));
    await req("/api/analytics/query", json({ account_id: id, group: "screener" }, internal)); // same day, same page: once

    expect((await req("/api/analytics/query", json({ account_id: id, group: "x" }))).status).toBe(403);
    expect((await req("/api/analytics/funnel")).status).toBe(403);

    const r = (await (await req("/api/analytics/funnel?days=7", { headers: internal })).json()) as any;
    expect(r.today.visits).toBe(2); // the bot is not counted
    expect(r.today.signups).toBe(1); // the owner's signup is not counted
    expect(r.today.activated).toBe(1);
    expect(r.today.mau).toBe(1);
    expect(r.by_channel.find((c: any) => c.channel === "social")).toMatchObject({ signups: 1, mau: 1 });
  });
});
