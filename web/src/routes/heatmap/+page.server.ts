import { api } from "$lib/server/api";

const PERIODS = ["1d", "1w", "1m", "3m", "1y"];
const INDICES = ["nifty50", "niftynext50", "nifty100", "midcap150", "smallcap250"];

export async function load({ url }) {
  const p = url.searchParams;
  const period = PERIODS.includes(p.get("period") ?? "") ? p.get("period")! : "1d";
  const sector = (p.get("sector") ?? "").slice(0, 80);
  // One map at a time: an index (default Nifty 50), all sectors, or one sector.
  const view = sector ? "sector" : p.get("view") === "sectors" ? "sectors" : INDICES.includes(p.get("view") ?? "") ? p.get("view")! : "nifty50";
  const size = p.get("size") === "turnover" ? "turnover" : "equal";

  const q = new URLSearchParams({ period });
  if (view === "sector") q.set("sector", sector);
  else if (view === "sectors") q.set("level", "sectors");
  else q.set("index", view);
  // The sector list for the picker comes from the all-sectors view (one cheap query).
  const [map, all] = await Promise.all([
    api(`/v1/market/heatmap?${q}`, { allowError: true }).catch(() => null),
    view === "sectors" ? null : api(`/v1/market/heatmap?period=${period}&level=sectors`, { allowError: true }).catch(() => null),
  ]);
  const sectorList = ((view === "sectors" ? map : all)?.sectors ?? []).map((s: { sector: string }) => s.sector).sort();
  return { map: map?.sectors ? map : { sectors: [], stocks: 0, as_of: null, error: map?.error?.message ?? "This heatmap isn't available right now." }, view, sector, period, size, periods: PERIODS, sectorList };
}
