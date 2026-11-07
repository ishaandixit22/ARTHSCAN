// Whether the phone layout is showing, for choices CSS can't make: what to load and what to
// subscribe to. Layout itself stays in CSS, so the server's HTML is right before any script runs.
// Read this in effects and handlers rather than in markup: the server can't know the screen size.

export const COMPACT_QUERY = "(max-width: 860px)";

export const viewport = $state({ compact: false });

if (typeof window !== "undefined") {
  const m = matchMedia(COMPACT_QUERY);
  viewport.compact = m.matches;
  m.addEventListener("change", (e) => (viewport.compact = e.matches));
}
