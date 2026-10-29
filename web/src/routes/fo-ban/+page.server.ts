import { api } from "$lib/server/api";

export async function load() {
  return { ban: await api("/v1/market/fo-ban?days=20") };
}
