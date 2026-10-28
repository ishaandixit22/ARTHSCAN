import type { Handle } from "@sveltejs/kit";
import { api } from "$lib/server/api";

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.account = null;
  event.locals.usage = null;
  const cookie = event.request.headers.get("cookie");
  if (cookie?.includes("al_session=")) {
    try {
      const me = await api("/api/me", { cookie, allowError: true });
      event.locals.account = me.account ?? null;
      event.locals.usage = me.usage ?? null;
    } catch {
      /* API down: render signed-out */
    }
  }
  return resolve(event);
};
