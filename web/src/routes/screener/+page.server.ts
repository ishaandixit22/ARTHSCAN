import { api } from "$lib/server/api";

// Filters live in the URL (f=field:op:value, repeatable) so every screen is a
// shareable link and works without JavaScript.
export async function load({ url }) {
  const filters = url.searchParams
    .getAll("f")
    .map((f) => f.split(":"))
    .filter((p) => p.length === 3 && p[2] !== "" && Number.isFinite(Number(p[2])))
    .map(([field, op, value]) => ({ field, op, value: Number(value) }));
  const sector = url.searchParams.get("sector") || undefined;
  const sort = url.searchParams.get("sort") || "turnover";
  const order = url.searchParams.get("order") === "asc" ? "asc" : "desc";
  const above200 = url.searchParams.get("above200") === "1";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);

  const [fields, sectors, result] = await Promise.all([
    api("/v1/screener/fields"),
    api("/v1/sectors"),
    api("/v1/screener", {
      body: { filters, sector, sort, order, above_sma_200: above200, limit: 50, offset: (page - 1) * 50 },
      allowError: true,
    }),
  ]);
  return {
    fields: fields.fields,
    sectors: sectors.sectors.map((s: any) => s.sector).sort(),
    query: { filters, sector, sort, order, above200, page },
    result: result.results ? result : { total: 0, results: [], error: result.error?.message },
  };
}
