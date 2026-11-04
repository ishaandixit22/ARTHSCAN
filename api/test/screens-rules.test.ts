import { describe, expect, it } from "vitest";
import { SCREENS, compileScreen, describeScreen, usesFundamentals } from "../src/screens/catalogue.js";

describe("prebuilt screens", () => {
  it("holds the 180 unblocked screens with unique slugs", () => {
    expect(SCREENS.length).toBe(180);
    expect(new Set(SCREENS.map((s) => s.slug)).size).toBe(180);
  });
  it("compiles every rule and reads it back", () => {
    const bad: string[] = [];
    for (const s of SCREENS) {
      try {
        const n = compileScreen(s);
        const d = describeScreen(s);
        if (!n || !d.rules.length) bad.push(`${s.id}: no rule lines`);
      } catch (e) { bad.push(`${s.id}: ${(e as Error).message}`); }
    }
    expect(bad).toEqual([]);
  });
  it("keeps weekly screens on company figures", () => {
    for (const s of SCREENS.filter((x) => x.kind === "weekly")) expect(usesFundamentals(compileScreen(s))).toBe(true);
  });
  it("gives every screen a description", () => {
    expect(SCREENS.filter((s) => !s.description.trim()).map((s) => s.id)).toEqual([]);
  });
});
