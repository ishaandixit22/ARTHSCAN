import { api } from "$lib/server/api";

const PAGE = 100;

export async function load({ url }) {
  const raw = (url.searchParams.get("letter") ?? "A").toUpperCase();
  const letter = /^[A-Z0]$/.test(raw) ? raw : "A";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const data = await api(`/v1/stocks?letter=${letter}&limit=${PAGE}&offset=${(page - 1) * PAGE}`);
  return { letter, page, pages: Math.max(1, Math.ceil(data.total / PAGE)), total: data.total, rows: data.results };
}
