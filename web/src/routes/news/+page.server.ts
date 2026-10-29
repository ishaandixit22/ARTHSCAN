import { ext } from "$lib/server/api";

export async function load() {
  return { news: await ext<any[]>("/news") };
}
