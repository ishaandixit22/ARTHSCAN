import { redirect } from "@sveltejs/kit";
import { api } from "$lib/server/api";

/** Same-site paths only, so return_to can't become an open redirect. */
const safeReturn = (v: string | null) => (v && v.startsWith("/") && !v.startsWith("//") ? v : "/settings/tokens");

export async function load({ locals, url }) {
  const returnTo = safeReturn(url.searchParams.get("return_to"));
  if (locals.account) redirect(303, returnTo);
  const config = await api("/api/auth/config");
  return { config, error: url.searchParams.get("error"), returnTo };
}
