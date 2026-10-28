const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export const price = (v: number | null | undefined) => (v == null ? "—" : `₹${inr.format(v)}`);
export const num = (v: number | null | undefined, dp = 2) =>
  v == null ? "—" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: dp, minimumFractionDigits: dp }).format(v);
export const int = (v: number | null | undefined) => (v == null ? "—" : inr0.format(v));
export const pct = (v: number | null | undefined, sign = true) =>
  v == null ? "—" : `${sign && v > 0 ? "+" : ""}${v.toFixed(2)}%`;

/** Rupees → "₹1,234 Cr" / "₹12.3 L". */
export function crore(v: number | null | undefined) {
  if (v == null) return "—";
  if (Math.abs(v) >= 1e7) return `₹${inr0.format(v / 1e7)} Cr`;
  if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return `₹${inr0.format(v)}`;
}

/** Already-in-crore values (financials, FII/DII). */
export const cr = (v: number | null | undefined) => (v == null ? "—" : `₹${inr0.format(v)} Cr`);

export function compact(v: number | null | undefined) {
  if (v == null) return "—";
  if (v >= 1e7) return `${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(2)} L`;
  return inr0.format(v);
}

export const tone = (v: number | null | undefined) => (v == null || v === 0 ? "" : v > 0 ? "up" : "down");

export function date(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export const slug = (s: string) => encodeURIComponent(s);
