import { ext } from "$lib/server/api";

export async function load({ url }) {
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q) return { q, cat: null, search: await ext<any[]>(`/mutual-funds/search?query=${encodeURIComponent(q)}`), funds: null };
  const funds = await ext<Record<string, Record<string, any[]>>>("/mutual-funds");
  const cats = Object.keys(funds.data ?? {});
  const want = url.searchParams.get("cat") ?? "Equity";
  return { q, cat: cats.includes(want) ? want : cats[0] ?? null, search: null, funds };
}
