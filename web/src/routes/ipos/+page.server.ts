import { ext } from "$lib/server/api";

const TABS = ["active", "upcoming", "closed", "listed"];

export async function load({ url }) {
  const tab = TABS.includes(url.searchParams.get("tab") ?? "") ? url.searchParams.get("tab")! : "active";
  return { tab, ipo: await ext<Record<string, any[]>>("/ipo") };
}
