import { error, redirect } from "@sveltejs/kit";
import { api } from "$lib/server/api";

// Consent screen for an OAuth connection (claude.ai, ChatGPT…). The API's
// /oauth/authorize validated the request and sent the browser here.
export async function load({ locals, params, request }) {
  if (!locals.account) redirect(303, `/login?return_to=${encodeURIComponent(`/connect/${params.id}`)}`);
  const res = await api(`/api/oauth/requests/${encodeURIComponent(params.id)}`, { cookie: request.headers.get("cookie"), allowError: true });
  if (!res.ok) error(410, res.error?.message ?? "This connection request has expired.");
  return { request: res.request };
}

async function decide(request: Request, id: string, approve: boolean) {
  const res = await api(`/api/oauth/requests/${encodeURIComponent(id)}/decision`, {
    cookie: request.headers.get("cookie"),
    body: { approve },
    allowError: true,
  });
  if (!res.ok) error(410, res.error?.message ?? "This connection request has expired.");
  redirect(303, res.redirect);
}

export const actions = {
  approve: ({ request, params }) => decide(request, params.id, true),
  deny: ({ request, params }) => decide(request, params.id, false),
};
