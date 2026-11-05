// What must hold on every page at every width, and the phone behaviours that keep pages light.
import { expect, test, type Page } from "@playwright/test";

const ROUTES = [
  "/", "/stocks", "/stock/ITC", "/heatmap", "/sectors", "/signals", "/fii-dii", "/deals", "/commodities", "/valuations", "/breadth",
  "/deliveries", "/fo-ban", "/events", "/screener", "/screener?tab=technical", "/screener/custom", "/earnings", "/filings",
  "/corporate-actions", "/board-meetings", "/ipos", "/ipos?tab=listed", "/mutual-funds", "/news", "/calculators", "/calculators/sip",
  "/developers", "/about", "/pricing", "/contact", "/terms", "/privacy", "/login",
];

const overflow = (page: Page) =>
  page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const scrolls = (el: Element) => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) if (/(auto|scroll)/.test(getComputedStyle(a).overflowX)) return true;
      return false;
    };
    const clipped = [...document.querySelectorAll("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.right > vw + 1 && getComputedStyle(el).position !== "fixed" && !scrolls(el);
      })
      .slice(0, 5)
      .map((el) => `${el.tagName}.${el.getAttribute("class") ?? ""}`);
    return { width: document.documentElement.scrollWidth, vw, clipped };
  });

for (const [width, height] of [[320, 640], [360, 780], [375, 812], [390, 844], [430, 932], [844, 390], [768, 1024]] as const) {
  test.describe(`no sideways scroll at ${width}×${height}`, () => {
    test.use({ viewport: { width, height }, isMobile: true, hasTouch: true });
    for (const route of ROUTES) {
      test(route, async ({ page }) => {
        const res = await page.goto(route, { waitUntil: "load" });
        expect(res?.ok()).toBe(true);
        // Charts take their width from the page once it has started; give them that moment.
        await expect.poll(async () => (await overflow(page)).clipped, { timeout: 4_000 }).toEqual([]);
        const m = await overflow(page);
        expect(m.width).toBeLessThanOrEqual(m.vw);
      });
    }
  });
}

for (const width of [1024, 1280, 1440]) {
  test.describe(`no sideways scroll at ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });
    for (const route of ROUTES) {
      test(route, async ({ page }) => {
        await page.goto(route, { waitUntil: "load" });
        expect((await overflow(page)).width).toBeLessThanOrEqual(width);
      });
    }
  });
}

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("content starts directly under the header", async ({ page }) => {
    await page.goto("/ipos");
    const top = await page.evaluate(() => document.querySelector("main")!.getBoundingClientRect().top + scrollY);
    expect(top).toBeLessThanOrEqual(60);
  });

  test("the home page loads neither the 3D city nor the stock index", async ({ page }) => {
    const seen: string[] = [];
    page.on("request", (r) => seen.push(r.url()));
    await page.goto("/", { waitUntil: "networkidle" });
    expect(seen.filter((u) => u.includes("search-index"))).toEqual([]);
    await expect(page.locator("canvas")).toHaveCount(0);
    await page.getByRole("button", { name: /3D city/i }).click();
    // Whether it then draws depends on the device's WebGL; the page must at least have asked for it.
    await expect(page.locator(".plate.ready")).toHaveCount(1, { timeout: 20_000 });
  });

  test("stock search asks the server, only after typing stops", async ({ page }) => {
    const searches: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/search.json")) searches.push(r.url());
      expect(r.url()).not.toContain("search-index");
    });
    await page.goto("/");
    await page.locator(".phone-bar").getByRole("button", { name: /search/i }).click();
    await page.keyboard.type("hdfc", { delay: 30 });
    await expect(page.getByRole("link", { name: /HDFCBANK/ }).first()).toBeVisible({ timeout: 10_000 });
    expect(searches.length).toBe(1);
  });

  test("a stock page loads its chart library and statements only on the way to them", async ({ page }) => {
    const seen: string[] = [];
    page.on("request", (r) => seen.push(r.url()));
    await page.goto("/stock/ITC", { waitUntil: "networkidle" });
    const early = seen.filter((u) => /statements|financials|\/filings/.test(u));
    expect(early).toEqual([]);
    await page.locator("#financials").scrollIntoViewIfNeeded();
    await expect.poll(() => seen.filter((u) => /statements|financials/.test(u)).length, { timeout: 15_000 }).toBeGreaterThan(0);
  });

  test("screener filters open in a sheet and Apply closes it", async ({ page }) => {
    await page.goto("/screener/custom");
    await page.getByRole("button", { name: /^Filters/ }).click();
    const sheet = page.getByRole("dialog", { name: /filters/i });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Apply" }).click();
    await expect(sheet).toBeHidden();
  });

  test("a long list shows 40 rows until asked", async ({ page }) => {
    await page.goto("/breadth");
    const rows = page.locator("table.m-capped tbody tr:visible");
    await expect(rows).toHaveCount(40);
    await page.locator(".m-more").click();
    expect(await rows.count()).toBeGreaterThan(40);
  });

  test("news thumbnails are not downloaded", async ({ page }) => {
    const images: string[] = [];
    page.on("request", (r) => r.resourceType() === "image" && images.push(r.url()));
    await page.goto("/news", { waitUntil: "load" });
    expect(images.filter((u) => !u.includes(new URL(page.url()).host))).toEqual([]);
  });
});

test.describe("landscape phone", () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  test("the bottom bar gives its height back to the page", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("nav.bottom")).toBeHidden();
  });
});
