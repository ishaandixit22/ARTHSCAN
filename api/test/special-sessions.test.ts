import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inSessionHours, isSessionDay, marketOpen, refreshDue, SPECIAL_SESSIONS } from "../src/lib/market-hours.js";

const ist = (s: string) => Date.parse(`${s}+05:30`);
const noNse = {} as never; // a special session must not need NSE's holiday list

describe("Muhurat session, Sunday 2026-11-08", () => {
  it("opens at 14:20 and closes after the grace period", async () => {
    expect(await marketOpen(noNse, ist("2026-11-08T14:19:00"))).toBe(false);
    expect(await marketOpen(noNse, ist("2026-11-08T14:20:00"))).toBe(true);
    expect(await marketOpen(noNse, ist("2026-11-08T15:45:00"))).toBe(true);
    expect(await marketOpen(noNse, ist("2026-11-08T15:46:00"))).toBe(false);
  });
  it("keeps the morning closed", () => expect(inSessionHours(ist("2026-11-08T10:00:00"))).toBe(false));
  it("counts as a session day for loading", () => expect(isSessionDay("2026-11-08")).toBe(true));
  it("is refreshed that evening and the next morning", () => {
    expect(refreshDue("30 16 * * *", ist("2026-11-08T22:00:00"))).toBe(true);
    expect(refreshDue("0 3 * * *", ist("2026-11-09T08:30:00"))).toBe(true);
  });
});

describe("ordinary days are unchanged", () => {
  it("other Sundays stay closed", () => {
    expect(inSessionHours(ist("2026-11-15T14:30:00"))).toBe(false);
    expect(isSessionDay("2026-11-15")).toBe(false);
  });
  it("weekday hours still apply", () => {
    expect(inSessionHours(ist("2026-11-09T09:15:00"))).toBe(true);
    expect(inSessionHours(ist("2026-11-09T09:14:00"))).toBe(false);
  });
  it("refreshes follow the old weekday pattern", () => {
    expect(refreshDue("30 16 * * *", ist("2026-11-13T22:00:00"))).toBe(true); // Friday
    expect(refreshDue("30 16 * * *", ist("2026-11-14T22:00:00"))).toBe(false); // Saturday
    expect(refreshDue("0 3 * * *", ist("2026-11-14T08:30:00"))).toBe(true); // Saturday morning, for Friday
    expect(refreshDue("0 3 * * *", ist("2026-11-15T08:30:00"))).toBe(false); // Sunday morning
    expect(refreshDue("0 3 * * *", ist("2026-11-16T08:30:00"))).toBe(false); // Monday morning
  });
});

it("the website lists the same special dates", () => {
  const web = readFileSync(new URL("../../web/src/lib/session.svelte.ts", import.meta.url), "utf8");
  for (const date of Object.keys(SPECIAL_SESSIONS)) expect(web).toContain(`"${date}"`);
});
