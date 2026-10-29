import { api } from "$lib/server/api";
import { matrixParams, matrixQuery } from "./matrix-params";

export async function load({ url }) {
  const params = matrixParams(url);
  const get = (tf: string) => api(`/v1/market/sector-matrix?${matrixQuery({ ...params, tf })}`, { allowError: true }).catch(() => null);
  const [data, rotation, first] = await Promise.all([api("/v1/sectors"), api("/v1/market/sector-rotation"), get(params.tf)]);
  let matrix = first?.sectors ? first : null;
  let notice: string | null = null;
  // Weekly needs about two and a half years of index history. Until it's stored, show the daily map rather than an empty one.
  if (matrix && !matrix.sectors.length && params.tf === "weekly" && !params.explicitTf) {
    const daily = await get("daily");
    if (daily?.sectors?.length) {
      matrix = daily;
      params.tf = "daily";
      notice = "The weekly view needs more index history than is stored yet, so this is the daily map.";
    }
  }
  return { sectors: data.sectors, rotation, matrix, params, notice };
}
