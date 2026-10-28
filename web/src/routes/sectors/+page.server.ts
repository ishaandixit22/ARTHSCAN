import { api } from "$lib/server/api";

export async function load() {
  const data = await api("/v1/sectors");
  return { sectors: data.sectors };
}
