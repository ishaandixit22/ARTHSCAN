import { api } from "$lib/server/api";

export async function load() {
  const [data, rotation] = await Promise.all([api("/v1/sectors"), api("/v1/market/sector-rotation")]);
  return { sectors: data.sectors, rotation };
}
