// The sector rotation map as markdown (text/markdown), for people and for assistants
// that read pages as context. Same settings as the page: ?lens=&bm=&tf=&size=.

import { api } from "$lib/server/api";
import { matrixParams, matrixQuery } from "../sectors/matrix-params";

export async function GET({ url }) {
  const params = matrixParams(url);
  const m = await api(`/v1/market/sector-matrix?${matrixQuery(params)}`, { allowError: true }).catch(() => null);
  const body = m?.markdown ?? "# Sector Rotation Map\n\nThe map isn't available right now.";
  return new Response(body, { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=300" } });
}
