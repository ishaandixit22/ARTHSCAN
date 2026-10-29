import { api } from "$lib/server/api";

const KINDS = ["results", "transcript", "concall", "presentation", "press", "board", "action", "other"];

export async function load({ url }) {
  const kind = KINDS.includes(url.searchParams.get("kind") ?? "") ? url.searchParams.get("kind")! : "";
  const symbol = (url.searchParams.get("symbol") ?? "").trim().toUpperCase().replace(/[^A-Z0-9&-]/g, "");
  const days = ["1", "2", "7"].includes(url.searchParams.get("days") ?? "") ? url.searchParams.get("days")! : "2";
  const q = new URLSearchParams({ limit: "400", ...(kind && { kind }), ...(symbol ? { symbol } : { days }) });
  const r = await api(`/v1/market/filings?${q}`, { allowError: true }).catch(() => null);
  return { filings: r?.filings ? r : null, error: r?.filings ? null : (r?.error?.message ?? "NSE filings aren't available right now."), kind, symbol, days };
}
