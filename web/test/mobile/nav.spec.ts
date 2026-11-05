// The phone menu must carry everywhere the desktop bar and footer go. A new page added to
// either fails here until the drawer has it too.
import { expect, test } from "@playwright/test";
import { FOOTER_COLUMNS } from "../../src/lib/footer";
import { drawerActive, drawerGroups, findDestinations, flatDestinations, navGroups, TOP_LINKS, BOTTOM_NAV } from "../../src/lib/nav";

const phone = (width: number, height = 800) => ({ viewport: { width, height }, isMobile: true, hasTouch: true });

test.describe("destinations", () => {
  const signedOut = flatDestinations(drawerGroups(false, false));
  const hrefs = new Set(signedOut.map((d) => d.href));

  test("every desktop menu entry is in the drawer", () => {
    const desktop = [
      ...navGroups(false).flatMap((g) => g.items.map((i) => i.href)),
      ...TOP_LINKS.map((l) => l.href),
      ...TOP_LINKS.flatMap((l) => l.menu?.groups.flatMap((g) => g.items.map((i) => i.href)) ?? []),
    ];
    expect(desktop.length).toBeGreaterThan(20);
    expect(desktop.filter((h) => !hrefs.has(h))).toEqual([]);
  });

  test("every footer link is in the drawer", () => {
    // /stock pages have no single address of their own; the drawer reaches them through "Look up a stock".
    const missing = FOOTER_COLUMNS.flatMap((c) => c.links.map((l) => l.href)).filter((h) => !hrefs.has(h) && !h.startsWith("/sectors.md"));
    expect(missing).toEqual([]);
  });

  test("Live joins the drawer only with live access", () => {
    expect(flatDestinations(drawerGroups(true, false)).some((d) => d.href === "/live")).toBe(true);
    expect(hrefs.has("/live")).toBe(false);
  });

  test("the bottom bar's tabs all exist in the drawer", () => {
    for (const t of BOTTOM_NAV) expect(hrefs.has(t.href), t.href).toBe(true);
  });

  test("menu search finds by name and by keyword", () => {
    expect(findDestinations(signedOut, "sip")[0].label).toMatch(/SIP/);
    expect(findDestinations(signedOut, "gmp").map((d) => d.href)).toContain("/ipos");
    expect(findDestinations(signedOut, "zzzz")).toEqual([]);
  });

  test("only the current page reads as active", () => {
    const url = new URL("https://x/ipos?tab=listed");
    const on = signedOut.filter((d) => drawerActive(d, url)).map((d) => d.href);
    expect(on).toContain("/ipos?tab=listed");
    expect(on).not.toContain("/ipos?tab=open");
  });
});

for (const width of [320, 360, 390, 430]) {
  test.describe(`drawer at ${width}`, () => {
    test.use(phone(width));

    test("opens, traps focus, locks the page and closes on Escape", async ({ page }) => {
      await page.goto("/sectors");
      const opener = page.getByRole("button", { name: /menu/i }).first();
      await opener.click();
      const dialog = page.getByRole("dialog", { name: "Site menu" });
      await expect(dialog).toBeVisible();
      await expect(page.getByRole("button", { name: "Close menu" })).toBeFocused();
      await expect(page.locator("html")).toHaveClass(/sheet-open/);
      const box = await dialog.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);

      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(page.locator("html")).not.toHaveClass(/sheet-open/);
      await expect(opener).toBeFocused();
    });

    test("groups in order, current section open with its page marked", async ({ page }) => {
      await page.goto("/sectors");
      await page.getByRole("button", { name: /menu/i }).first().click();
      const dialog = page.getByRole("dialog", { name: "Site menu" });
      await expect(dialog.locator("details.group > summary")).toHaveText(["Markets", "Discover", "Research", "Investments", "News", "Tools & Data", "Platform"]);
      await expect(dialog.locator('a[aria-current="page"]')).toHaveCount(1);
      await expect(dialog.locator('a[aria-current="page"]')).toHaveAttribute("href", "/sectors");
    });

    test("the list scrolls on its own and navigating closes the drawer", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: /menu/i }).first().click();
      const dialog = page.getByRole("dialog", { name: "Site menu" });
      await dialog.locator("details.group > summary", { hasText: "Platform" }).click();
      const pricing = dialog.getByRole("link", { name: "Pricing" });
      await pricing.scrollIntoViewIfNeeded();
      await pricing.click();
      await expect(page).toHaveURL(/\/pricing$/);
      await expect(dialog).toBeHidden();
      await expect(page.locator("html")).not.toHaveClass(/sheet-open/);
    });

    test("menu search filters to matching pages", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: /menu/i }).first().click();
      const dialog = page.getByRole("dialog", { name: "Site menu" });
      await dialog.getByRole("searchbox", { name: "Find a page or tool" }).fill("emi");
      await expect(dialog.getByRole("link", { name: /^EMI/ })).toBeVisible();
      await expect(dialog.locator("details.group")).toHaveCount(0);
    });
  });
}

test.describe("bottom bar", () => {
  test.use(phone(390));

  test("has five tabs, marks the section and More opens the drawer", async ({ page }) => {
    await page.goto("/heatmap");
    const bar = page.locator("nav.bottom");
    await expect(bar.locator("a, button")).toHaveText(["Home", "Markets", "Screener", "IPOs", "More"]);
    await expect(bar.getByRole("link", { name: "Markets" })).toHaveAttribute("aria-current", "page");
    await bar.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("dialog", { name: "Site menu" })).toBeVisible();
  });

  test("tap targets in the header and bar are comfortably large", async ({ page }) => {
    await page.goto("/");
    const targets = page.locator("nav.bottom a, nav.bottom button, .phone-bar button, .phone-bar a");
    for (let i = 0; i < (await targets.count()); i++) {
      const box = await targets.nth(i).boundingBox();
      expect(box!.height, await targets.nth(i).innerText()).toBeGreaterThanOrEqual(38);
    }
  });
});

test.describe("desktop stays as it was", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("masthead and section bar, no phone chrome", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("header.mast")).toBeVisible();
    await expect(page.locator("nav.sections")).toBeVisible();
    await expect(page.locator("nav.sections").getByRole("button", { name: "Markets" })).toBeVisible();
    await expect(page.locator(".phone-bar")).toBeHidden();
    await expect(page.locator("nav.bottom")).toBeHidden();
  });

  test("the Markets menu still opens with its three columns", async ({ page }) => {
    await page.goto("/");
    await page.locator("nav.sections").getByRole("button", { name: "Markets" }).click();
    await expect(page.locator("#markets-panel section")).toHaveCount(3);
  });
});
