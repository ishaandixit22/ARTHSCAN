import { ext } from "$lib/server/api";

export async function load() {
  return { c: await ext<any[]>("/commodities") };
}
