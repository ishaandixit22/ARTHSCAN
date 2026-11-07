import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env.js";
import type { CheckReport } from "../src/jobs/check.js";
import { failureMessage, summaryMessage } from "../src/jobs/health-report.js";
import { notify } from "../src/lib/notify.js";

afterEach(() => vi.unstubAllGlobals());

const check: CheckReport = {
  at: "2026-11-08T04:30:00Z", latest_published: "2026-11-06", latest_loaded: "2026-11-06", ms: 10,
  items: [
    { check: "session 2026-11-06", status: "fixed", message: "Loaded the missed session" },
    { check: "metrics", status: "ok", message: "As of 2026-11-06" },
    { check: "bse prices", status: "ok", message: "As of 2026-11-06" },
  ],
};

describe("alerts", () => {
  it("sends email through Resend and WhatsApp through CallMeBot when both are set up", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return url.includes("callmebot") ? new Response("<p>Message queued. You will receive it in a few seconds.</p>") : new Response('{"id":"x"}');
    }));
    const env = { RESEND_API_KEY: "re_test", ALERT_EMAIL_TO: "me@example.com", CALLMEBOT_PHONE: "+911234567890", CALLMEBOT_APIKEY: "123" } as Env;
    const sent = await notify(env, { subject: "Arthscan: all good", text: "long text", short: "short" });
    expect(sent).toEqual({ email: "sent", whatsapp: "sent" });
    const mail = JSON.parse(String(calls.find((c) => c.url.includes("resend"))!.init!.body));
    expect(mail).toMatchObject({ to: ["me@example.com"], subject: "Arthscan: all good", text: "long text" });
    const wa = new URL(calls.find((c) => c.url.includes("callmebot"))!.url);
    expect(wa.searchParams.get("text")).toBe("Arthscan: all good\n\nshort");
  });

  it("skips channels without settings and never throws", async () => {
    const fetchMock = vi.fn(async () => { throw new Error("network down"); });
    vi.stubGlobal("fetch", fetchMock);
    expect(await notify({} as Env, { subject: "s", text: "t" })).toEqual({ email: "off", whatsapp: "off" });
    expect(fetchMock).not.toHaveBeenCalled();
    const sent = await notify({ RESEND_API_KEY: "k", ALERT_EMAIL_TO: "a@b.c" } as Env, { subject: "s", text: "t" });
    expect(sent.email).toMatch(/failed: network down/);
  });

  it("reports CallMeBot's error page as a failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<b>APIKey is invalid</b>")));
    const sent = await notify({ CALLMEBOT_PHONE: "+91", CALLMEBOT_APIKEY: "bad" } as Env, { subject: "s", text: "t" });
    expect(sent.whatsapp).toMatch(/APIKey is invalid/);
  });

  it("summarises an all-good morning, with repairs listed", () => {
    const m = summaryMessage(check, [{ name: "Dhan quote", ok: true, detail: "RELIANCE 1400" }]);
    expect(m.subject).toBe("Arthscan: all good (2026-11-08)");
    expect(m.text).toContain("Repaired automatically");
    expect(m.short).toContain("1/1 checks OK");
  });

  it("counts problems from both the self-check and the probes", () => {
    const m = summaryMessage({ ...check, items: [...check.items, { check: "bse prices", status: "failed", message: "Were 2026-11-05" }] },
      [{ name: "Dhan quote", ok: false, detail: "Token expired" }]);
    expect(m.subject).toBe("Arthscan: 2 problems (2026-11-08)");
    expect(m.short).toContain("✗ Dhan quote: Token expired");
  });

  it("alerts on failed refresh steps only", () => {
    expect(failureMessage({ date: "2026-11-06", ms: 1, steps: [{ step: "prices", status: "ok" }, { step: "indices", status: "skipped" }] }, { failedCalls: 0, stocks: 2000 }, "22:00 IST")).toBeNull();
    const m = failureMessage({ date: "2026-11-06", ms: 1, steps: [{ step: "deliveries", status: "error", message: "HTTP 403" }] }, { failedCalls: 2, stocks: 2000 }, "22:00 IST");
    expect(m?.subject).toBe("Arthscan alert: 2 failed steps in the 22:00 IST refresh");
    expect(m?.text).toContain("NSE deliveries (2026-11-06): HTTP 403");
  });
});
