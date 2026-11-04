import { redirect } from "@sveltejs/kit";
import { api } from "$lib/server/api";

export async function load({ url }) {
  // Links saved before the prebuilt screens arrived held their filters here.
  if (["f", "sector", "sort", "order", "above200", "page"].some((k) => url.searchParams.has(k))) redirect(301, `/screener/custom${url.search}`);
  const { screens } = await api<{ screens: any[] }>("/api/screens");
  return { screens, tab: url.searchParams.get("tab") === "technical" ? "technical" : "fundamental" };
}
