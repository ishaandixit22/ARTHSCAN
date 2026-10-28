import { api } from "$lib/server/api";

export async function load() {
  return { flows: await api("/v1/market/fii-dii?days=60") };
}
