// The screens with their rules compiled, and lookups over them.

import { SCREEN_DATA } from "./catalogue.data.js";
import { type Node, parseIndicator, parsePlain, ruleColumns, ruleLines } from "./rules.js";

export type ScreenKind = "weekly" | "live" | "intraday";
export type Universe = "all" | "fno" | "nifty50" | "nifty500";
export type Screen = {
  id: string; slug: string; name: string; description: string;
  segment: "fundamental" | "technical"; group: string | null; subsegment: string;
  kind: ScreenKind; direction: "bullish" | "bearish" | "neutral" | null; timeframe: string | null;
  universe: Universe; form: "plain" | "indicator"; rule: string; note: string | null;
};

export const SCREENS = SCREEN_DATA as unknown as Screen[];
const BY_SLUG = new Map(SCREENS.map((s) => [s.slug, s]));
export const screenBySlug = (slug: string) => BY_SLUG.get(slug);

const compiled = new Map<string, Node>();
export function compileScreen(s: Screen): Node {
  let n = compiled.get(s.id);
  if (!n) {
    n = s.form === "plain" ? parsePlain(s.rule) : parseIndicator(s.rule);
    compiled.set(s.id, n);
  }
  return n;
}

/** Whether a rule reads company figures, so a run knows to load them. */
export function usesFundamentals(n: Node): boolean {
  switch (n.k) {
    case "fund": return true;
    case "and": case "or": return n.xs.some(usesFundamentals);
    case "cmp": case "math": return usesFundamentals(n.a) || usesFundamentals(n.b);
    case "fn": return n.args.some(usesFundamentals);
    case "win": return usesFundamentals(n.expr);
    default: return false;
  }
}

/** What a screen shows about itself: everything but the rule's source text. */
export function describeScreen(s: Screen) {
  const { rule: _rule, form: _form, ...rest } = s;
  const n = compileScreen(s);
  return { ...rest, rules: ruleLines(n), columns: ruleColumns(n).map((c) => ({ id: c.id, label: c.label })) };
}
