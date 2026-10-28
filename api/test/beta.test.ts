import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { migrate, SqliteDatabase } from "../src/db/sqlite.js";
import type { Env } from "../src/env.js";

const db = new SqliteDatabase(":memory:");
const env: Env = {
  DB: db, PUBLIC_SITE_ORIGIN: "https://arthscan.me", TOKEN_PEPPER: "t", INTERNAL_API_KEY: "i",
  FREE_DAILY_QUOTA: "50", AUTH_DEV_LOGIN: "true", INVITE_ONLY: "true",
};
const req = (path: string, init: RequestInit = {}) => app.fetch(new Request(`http://x${path}`, init), env);
const json = (body: unknown, headers: Record<string, string> = {}) => ({ method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const internal = { headers: { "x-internal-key": "i" } };

beforeAll(() => {
  migrate(db);
  db.raw.exec(`
    INSERT INTO invites (email) VALUES ('invited@example.com');
    INSERT INTO stocks (symbol, name) VALUES ('OLD', 'Old Co'), ('NEWCO', 'New Listing Ltd');
    INSERT INTO stock_metrics (symbol, as_of, close, change_pct, turnover, first_date) VALUES
      ('OLD', '2026-10-28', 100, 5, 5e8, '2025-10-28'),
      ('NEWCO', '2026-10-28', 126, 26.7, 9e9, '2026-10-28');
  `);
});

describe("invite-only beta", () => {
  it("refuses sign-in for emails not on the list", async () => {
    const r = await req("/api/auth/dev", json({ email: "stranger@example.com" }));
    expect(r.status).toBe(403);
  });

  it("removing an invite cuts off the session and its API tokens", async () => {
    const login = await req("/api/auth/dev", json({ email: "Invited@Example.com" }));
    expect(login.status).toBe(200);
    const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
    const tok = ((await (await req("/api/tokens", json({ name: "t" }, { cookie }))).json()) as any).token.secret;
    const quote = () => req("/v1/market/movers", { headers: { authorization: `Bearer ${tok}` } });
    expect((await quote()).status).toBe(200);

    db.raw.exec("DELETE FROM invites WHERE email = 'invited@example.com'");
    expect((await quote()).status).toBe(401);
    const me = (await (await req("/api/me", { headers: { cookie } })).json()) as any;
    expect(me.account).toBeNull();
    db.raw.exec("INSERT INTO invites (email) VALUES ('invited@example.com')");
  });

  it("reports invite-only in the auth config", async () => {
    const cfg = (await (await req("/api/auth/config")).json()) as any;
    expect(cfg.invite_only).toBe(true);
  });

  it("sends security headers", async () => {
    const r = await req("/health");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("strict-transport-security")).toContain("max-age=");
  });
});

describe("listing-day stocks and empty fundamentals", () => {
  it("keeps listing-day jumps out of gainers but tags them in most active", async () => {
    const gainers = (await (await req("/v1/market/movers?kind=gainers", internal)).json()) as any;
    expect(gainers.data.results.map((r: any) => r.symbol)).toEqual(["OLD"]);
    const active = (await (await req("/v1/market/movers?kind=active", internal)).json()) as any;
    expect(active.data.results[0]).toMatchObject({ symbol: "NEWCO", listed_today: 1 });
  });

  it("marks fundamentals fields unavailable until data exists", async () => {
    const f = (await (await req("/v1/screener/fields", internal)).json()) as any;
    const byKey = Object.fromEntries(f.data.fields.map((x: any) => [x.key, x.available]));
    expect(byKey.pe).toBe(false);
    expect(byKey.close).toBe(true);
  });
});
