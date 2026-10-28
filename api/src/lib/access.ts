// Private-beta gate. While INVITE_ONLY is "true", an account counts only if its
// email is in the invites table — checked on every request, so deleting an
// invite revokes website sessions, API tokens and OAuth grants together.

import type { Env } from "../env.js";

export const inviteOnly = (env: Env) => env.INVITE_ONLY === "true";

export async function isInvited(env: Env, email: string | null | undefined): Promise<boolean> {
  if (!inviteOnly(env)) return true;
  if (!email) return false;
  const row = await env.DB.prepare("SELECT 1 AS ok FROM invites WHERE email = ?").bind(email.trim().toLowerCase()).first();
  return !!row;
}
