export const SESSION_COOKIE = "al_session";

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(value: string, maxAgeSec: number, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${maxAgeSec}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}
