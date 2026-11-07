// Messages to the owner: email through Resend and WhatsApp through CallMeBot. Each channel is used only
// when its settings are present (wrangler secrets), so a missing key never breaks the job that calls this.
//
//   RESEND_API_KEY, ALERT_EMAIL_TO, ALERT_EMAIL_FROM   email (ALERT_EMAIL_FROM must be on a domain verified in Resend)
//   CALLMEBOT_PHONE, CALLMEBOT_APIKEY                  WhatsApp (phone with country code, e.g. +9198…)

import type { Env } from "../env.js";

export type Message = { subject: string; text: string; /** Short form for WhatsApp; the text is used when absent. */ short?: string };
export type Sent = { email: "sent" | "off" | string; whatsapp: "sent" | "off" | string };

const TIMEOUT_MS = 15_000;
const WHATSAPP_MAX = 900;

async function email(env: Env, m: Message): Promise<string> {
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL_TO) return "off";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.ALERT_EMAIL_FROM || "Arthscan Monitor <alerts@arthscan.me>",
      to: env.ALERT_EMAIL_TO.split(",").map((s) => s.trim()).filter(Boolean),
      subject: m.subject,
      text: m.text,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return res.ok ? "sent" : `HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`;
}

async function whatsapp(env: Env, m: Message): Promise<string> {
  if (!env.CALLMEBOT_PHONE || !env.CALLMEBOT_APIKEY) return "off";
  const body = `${m.subject}\n\n${m.short ?? m.text}`;
  const text = body.length > WHATSAPP_MAX ? `${body.slice(0, WHATSAPP_MAX - 1)}…` : body;
  const qs = new URLSearchParams({ phone: env.CALLMEBOT_PHONE, text, apikey: env.CALLMEBOT_APIKEY });
  const res = await fetch(`https://api.callmebot.com/whatsapp.php?${qs}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const reply = await res.text();
  // CallMeBot answers 200 with an HTML page even for some errors; its success page says "Message queued".
  return res.ok && /queued|sent/i.test(reply) ? "sent" : `HTTP ${res.status}: ${reply.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160)}`;
}

/** Sends on every configured channel. Never throws; the outcome per channel is returned and logged. */
export async function notify(env: Env, m: Message): Promise<Sent> {
  const settle = (p: Promise<string>) => p.catch((err) => `failed: ${err instanceof Error ? err.message : err}`);
  const [e, w] = await Promise.all([settle(email(env, m)), settle(whatsapp(env, m))]);
  console.log(`notify "${m.subject}": email ${e}, whatsapp ${w}`);
  return { email: e, whatsapp: w };
}
