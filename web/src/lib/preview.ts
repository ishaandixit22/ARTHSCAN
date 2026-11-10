// What a signed-out visitor sees, so people and search engines can reach every public page:
//
//   full      calculators, the home page and the site's own pages
//   own gate  stock pages, which leave their deeper sections out of the page entirely
//   fold      every other market page: the top of the page, fading into a sign-in prompt
//   sign-in   the account pages, and the data behind a stock page's gated sections
//
// The fold hides with CSS, so the whole page is still in the HTML. That keeps its links crawlable, and
// it's a nudge to sign in rather than a lock. Set REQUIRE_SIGN_IN to "false" to show everything to everyone.

const FULL = /^\/($|calculators(\/|$)|(about|contact|pricing|terms|privacy|developers|login)$)/;
const OWN_GATE = /^\/stock\/[^/]+$/;
const SIGN_IN_ONLY = /^\/(settings|connect)(\/|$)|^\/stock\/[^/]+\/(chart|fundamentals|statements|filings)$/;

export const needsSignIn = (path: string) => SIGN_IN_ONLY.test(path);
export const usesFold = (path: string) => !FULL.test(path) && !OWN_GATE.test(path) && !SIGN_IN_ONLY.test(path);

/** Where sign-in should bring the visitor back to. */
export const signInHref = (url: URL) => `/login?return_to=${encodeURIComponent(url.pathname + url.search)}`;
