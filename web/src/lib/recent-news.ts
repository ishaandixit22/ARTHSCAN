// The provider's "recent" news can be months old for smaller companies, and a stock page shouldn't
// present that as current. An item with no readable date is left out: it can't be shown to be recent.

export const NEWS_MAX_AGE_DAYS = 30;

export function recentNews<T extends { date?: string | null }>(news: T[] | null | undefined, now = Date.now()): T[] {
  const cutoff = now - NEWS_MAX_AGE_DAYS * 24 * 3600_000;
  return (news ?? []).filter((n) => {
    // The provider writes dates as 2026-11-07T12:30:24+0000.
    const at = n.date ? Date.parse(n.date.replace(/\+0000$/, "Z")) : NaN;
    return at >= cutoff;
  });
}
