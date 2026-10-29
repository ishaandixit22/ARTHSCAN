import { fail, redirect } from "@sveltejs/kit";
import { api } from "$lib/server/api";
import { siteOrigin } from "$lib/server/origin";

export async function load({ locals, request, url }) {
  if (!locals.account) redirect(303, "/login");
  const cookie = request.headers.get("cookie");
  const [tokens, usage, grants] = await Promise.all([
    api("/api/tokens", { cookie }),
    api("/api/usage", { cookie }),
    api("/api/oauth/grants", { cookie }),
  ]);
  // Owners see the Dhan live-feed status and can replace its access token.
  const liveStatus = locals.owner ? await api("/api/live/status", { cookie, allowError: true }) : null;
  return { tokens: tokens.tokens, history: usage, apps: grants.grants, origin: siteOrigin(url), liveStatus };
}

export const actions = {
  create: async ({ request }) => {
    const cookie = request.headers.get("cookie");
    const form = await request.formData();
    const res = await api("/api/tokens", { cookie, body: { name: String(form.get("name") ?? "") }, allowError: true });
    if (!res.ok) return fail(400, { error: res.error?.message ?? "Could not create the token." });
    return { created: res.token };
  },
  revoke: async ({ request }) => {
    const cookie = request.headers.get("cookie");
    const form = await request.formData();
    await api(`/api/tokens/${encodeURIComponent(String(form.get("id")))}`, { cookie, method: "DELETE", allowError: true });
    return { revoked: true };
  },
  disconnect: async ({ request }) => {
    const cookie = request.headers.get("cookie");
    const form = await request.formData();
    await api(`/api/oauth/grants/${encodeURIComponent(String(form.get("client_id")))}`, { cookie, method: "DELETE", allowError: true });
    return { disconnected: true };
  },
  dhanToken: async ({ request, locals }) => {
    if (!locals.owner) return fail(403, { dhanError: "Only the owner can change the Dhan token." });
    const form = await request.formData();
    const res = await api("/api/live/token", { cookie: request.headers.get("cookie"), body: { token: String(form.get("token") ?? "") }, allowError: true });
    if (!res.ok) return fail(400, { dhanError: res.error?.message ?? res.error ?? "Dhan rejected that token." });
    return { dhanSaved: true };
  },
  logout: async ({ request, cookies }) => {
    await api("/api/auth/logout", { cookie: request.headers.get("cookie"), method: "POST", allowError: true });
    cookies.delete("al_session", { path: "/" });
    redirect(303, "/");
  },
};
