import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export function jsonError(c: Context, status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return c.json({ ok: false, error: { code, message, ...extra } }, status as ContentfulStatusCode);
}
