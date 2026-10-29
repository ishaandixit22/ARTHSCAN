// The map's settings from the URL: lens, benchmark, timeframe and bubble size.
const pick = (v: string | null, allowed: string[], fallback: string) => (v && allowed.includes(v) ? v : fallback);

export function matrixParams(url: URL) {
  const p = url.searchParams;
  return {
    lens: pick(p.get("lens"), ["classic", "trend", "risk", "volume"], "classic"),
    bm: pick(p.get("bm"), ["nifty50", "nifty500"], "nifty50"),
    tf: pick(p.get("tf"), ["weekly", "daily"], "weekly"),
    size: pick(p.get("size"), ["uniform", "rvol", "volatility", "velocity"], "uniform"),
    explicitTf: p.has("tf"),
  };
}

export const matrixQuery = (m: { lens: string; bm: string; tf: string; size: string }) =>
  new URLSearchParams({ lens: m.lens, benchmark: m.bm, timeframe: m.tf, size: m.size }).toString();
