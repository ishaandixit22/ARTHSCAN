import { error } from "@sveltejs/kit";
import { ext } from "$lib/server/api";

export async function load({ url }) {
  const name = (url.searchParams.get("name") ?? "").trim().slice(0, 160);
  if (!name) error(404, "Pick a scheme from the mutual funds page.");
  return { name, fund: await ext<any>(`/mutual-funds/details?name=${encodeURIComponent(name)}`) };
}
