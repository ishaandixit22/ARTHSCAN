import type { LayoutServerLoad } from "./$types";
import { api } from "$lib/server/api";
import { NIFTY_50 } from "$lib/nifty50";

export const load: LayoutServerLoad = async ({ locals }) => {
  // The ticker never blocks a page: if quotes can't be read, it simply doesn't show.
  const ticker = await api<{ quotes: any[] }>("/v1/quotes", { body: { symbols: NIFTY_50 }, allowError: true }).catch(() => null);
  const bySymbol = new Map((ticker?.quotes ?? []).map((q) => [q.symbol, q]));
  return {
    account: locals.account,
    usage: locals.usage,
    live: locals.live,
    owner: locals.owner,
    ticker: NIFTY_50.map((s) => bySymbol.get(s)).filter(Boolean),
  };
};
