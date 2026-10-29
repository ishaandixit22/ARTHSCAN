import { api } from "$lib/server/api";

export async function load({ url }) {
  const sort = url.searchParams.get("sort") === "deliv_jump" ? "deliv_jump" : "deliv_pct";
  return { sort, data: await api(`/v1/market/deliveries?sort=${sort}&limit=100&min_turnover_cr=5`) };
}
