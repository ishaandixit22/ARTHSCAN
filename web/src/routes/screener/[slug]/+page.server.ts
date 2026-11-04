import { api } from "$lib/server/api";

export async function load({ params, url, setHeaders }) {
  setHeaders({ "cache-control": "no-store" }); // results follow the market
  const q = new URLSearchParams();
  for (const k of ["sort", "dir", "page"]) { const v = url.searchParams.get(k); if (v) q.set(k, v); }
  const qs = q.toString();
  const path = `/api/screens/${encodeURIComponent(params.slug)}`;
  const info = await api<{ screen: any }>(`${path}?only=info`);
  return {
    screen: info.screen,
    qs,
    sort: url.searchParams.get("sort") ?? "mcap",
    dir: url.searchParams.get("dir") === "asc" ? "asc" : "desc",
    // Stored results come straight back. A live run can take several seconds, so the browser asks for it after
    // the rules have shown. (Streaming it from here is blocked by the site's script policy.)
    result: info.screen.kind === "live" ? null : await api<any>(`${path}?${qs}`, { allowError: true }).catch(() => null),
  };
}
