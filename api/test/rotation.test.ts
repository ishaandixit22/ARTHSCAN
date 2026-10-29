import { describe, expect, it } from "vitest";
import {
  type Bar, buildMatrix, crossSection, LENSES, matrixMarkdown, minHistory, PARAMS, quadrantOf, regression, resample, sma, sortino, zNorm,
} from "../src/lib/rotation.js";

const day = (i: number) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10);
const bars = (closes: number[], volume = 1000): Bar[] =>
  closes.map((c, i) => ({ date: day(i), open: c, high: c * 1.01, low: c * 0.99, close: c, volume }));

describe("building blocks", () => {
  it("rolling mean and z-score centre on 100", () => {
    expect(sma([1, 2, 3, 4, 5], 3).slice(2)).toEqual([2, 3, 4]);
    const z = zNorm([1, 2, 3, 4, 5, 6], 4);
    // Window [3,4,5,6]: mean 4.5, sd = sqrt(5/3); z of 6 = 1.5/1.2910 = 1.1619 → 100 + 2.3238.
    expect(z[5]).toBeCloseTo(100 + 2 * (1.5 / Math.sqrt(5 / 3)), 6);
    expect(zNorm([5, 5, 5, 5], 4)[3]).toBe(100); // no variation: dead centre
  });

  it("regression recovers an exact slope, and its t-stat reflects noise", () => {
    const line = Array.from({ length: 10 }, (_, i) => 3 + 0.5 * i);
    const exact = regression(line, 10);
    expect(exact.slope[9]).toBeCloseTo(0.5, 10);
    expect(exact.t[9]).toBe(1000); // a perfectly straight line is capped, not infinite
    // Same trend with alternating noise: same slope direction, far smaller t-stat.
    const noisy = line.map((v, i) => v + (i % 2 ? 0.8 : -0.8));
    expect(regression(noisy, 10).slope[9]).toBeGreaterThan(0.3);
    expect(regression(noisy, 10).t[9]).toBeLessThan(10);
    // Hand calculation: y = [0,1,0,1,0,1] over L = 6: slope = 0.0857, t = 0.0857 / SE.
    const r = regression([0, 1, 0, 1, 0, 1], 6);
    expect(r.slope[5]).toBeCloseTo(3 / 35, 8);
    expect(r.t[5]).toBeCloseTo(0.6124, 3); // b / sqrt(RSS/(L-2)/Sxx) = 0.0857 / 0.1400
  });

  it("Sortino penalises downside only", () => {
    const up = sortino([0.01, 0.02, 0.01, 0.02, 0.01], 4); // no losses: floored denominator, large positive
    expect(up[4]).toBeGreaterThan(100);
    const mixed = sortino([0, 0.02, -0.01, 0.02, -0.01], 4);
    // Last 4: mean 0.005, downside sqrt((0.0001+0.0001)/4) = 0.007071 → 0.7071
    expect(mixed[4]).toBeCloseTo(0.7071, 3);
  });

  it("groups bars into weeks: last close, high/low range, summed volume", () => {
    // 1 Jan 2024 is a Monday: ten days = one full week, three days of the next.
    const w = resample(bars(Array.from({ length: 10 }, (_, i) => 100 + i)), "weekly");
    expect(w).toHaveLength(2);
    expect(w[0]).toMatchObject({ date: day(6), close: 106, volume: 7000 });
    expect(w[0].high).toBeCloseTo(106 * 1.01, 8);
    expect(w[0].low).toBeCloseTo(100 * 0.99, 8);
    expect(w[1].close).toBe(109);
  });

  it("splits the plane at (100, 100)", () => {
    expect([quadrantOf(101, 101), quadrantOf(101, 99), quadrantOf(99, 99), quadrantOf(99, 101)]).toEqual(["tr", "br", "bl", "tl"]);
  });
});

describe("the four lenses", () => {
  const n = minHistory("classic", "daily") + 30;
  const bench = bars(Array.from({ length: n }, (_, i) => 1000 + i * 0.5));
  // Steady compounders, a faster one, a faller, and a flat one.
  const mk = (rate: number, vol = 1000) => bars(Array.from({ length: n }, (_, i) => 1000 * Math.exp(rate * i)), vol);
  const data = new Map([
    ["Nifty 50", bench], ["Nifty IT", mk(0.004, 3000)], ["Nifty Bank", mk(0.002, 1000)], ["Nifty Metal", mk(-0.003, 400)],
    ["Nifty Pharma", mk(0.0005, 1500)], ["Nifty Auto", mk(0.001, 2000)],
  ]);

  for (const lens of ["classic", "trend", "risk", "volume"] as const) {
    it(`${lens}: puts the strongest sector to the right of the weakest, on a 100-centred scale`, () => {
      const m = buildMatrix(data, lens, "nifty50", "daily", "uniform");
      const by = Object.fromEntries(m.sectors.map((s) => [s.name, s]));
      expect(m.sectors.length).toBe(5);
      expect(m.sectors.every((s) => Math.abs(s.x - 100) < 40 && Math.abs(s.y - 100) < 40)).toBe(true);
      if (lens !== "volume" && lens !== "classic") expect(by.IT.x).toBeGreaterThan(by.Metal.x);
      if (lens === "classic") expect(by.IT.tail).toHaveLength(8);
    });
  }

  it("cross-section: 100 is the average sector, 2 points a standard deviation", () => {
    const dates = ["d1", "d2"];
    const sec = [10, 20, 30].map((v) => ({ dates, x: [v, v], y: [1, 1] }));
    crossSection(sec, 1);
    expect(sec.map((s) => s.x[1])).toEqual([98, 100, 102]); // mean 20, sd 10 → ∓2
    expect(sec[0].x[0]).toBeNaN(); // only the newest dates are computed
    expect(sec.every((s) => s.y[1] === 100)).toBe(true); // no spread: dead centre
  });

  it("skips a sector without enough history, and says so", () => {
    const m = buildMatrix(new Map([["Nifty 50", bench], ["Nifty IT", mk(0.004).slice(0, 40)]]), "classic", "nifty50", "daily", "uniform");
    expect(m.sectors).toHaveLength(0);
    expect(m.skipped).toContain("IT");
  });
});

describe("matrix and markdown", () => {
  const n = minHistory("classic", "daily") + 30;
  const bench = bars(Array.from({ length: n }, (_, i) => 1000 + i * 0.5));
  const mk = (rate: number, vol: number) => bars(Array.from({ length: n }, (_, i) => 1000 * Math.exp(rate * i)), vol);
  const data = new Map([["Nifty 50", bench], ["Nifty 500", bench], ["Nifty IT", mk(0.003, 3000)], ["Nifty Metal", mk(-0.002, 500)], ["Nifty Bank", mk(0.001, 1500)]]);

  it("sizes bubbles 0..1 by the chosen measure, and uniformly otherwise", () => {
    const uniform = buildMatrix(data, "classic", "nifty50", "daily", "uniform");
    expect(new Set(uniform.sectors.map((s) => s.size))).toEqual(new Set([0.5]));
    const byVol = buildMatrix(data, "classic", "nifty50", "daily", "volatility");
    expect(Math.max(...byVol.sectors.map((s) => s.size))).toBe(1);
    expect(Math.min(...byVol.sectors.map((s) => s.size))).toBe(0);
  });

  it("names the lens, axes, benchmark, timeframe and every sector in the markdown", () => {
    for (const lens of ["classic", "trend", "risk", "volume"] as const) {
      const md = matrixMarkdown(buildMatrix(data, lens, "nifty500", "daily", "uniform"));
      expect(md).toContain(`**Lens:** ${LENSES[lens].label}`);
      expect(md).toContain(`**X axis:** ${LENSES[lens].x}`);
      expect(md).toContain(`**Y axis:** ${LENSES[lens].y}`);
      expect(md).toContain("**Benchmark:** Nifty 500");
      expect(md).toContain("**Timeframe:** Daily");
      expect(md).toMatch(/\| IT \| [\d.]+ \| [\d.]+ \| -?\+?[\d.]+ \| -?\+?[\d.]+ \| /);
    }
    expect(PARAMS.weekly.long).toBe(60);
  });
});

describe("get_sector_matrix over the API", () => {
  it("reads index history from the database and returns the matrix with its markdown", async () => {
    const { app } = await import("../src/app.js");
    const { migrate, SqliteDatabase } = await import("../src/db/sqlite.js");
    const db = new SqliteDatabase(":memory:");
    migrate(db);
    const n = minHistory("classic", "daily") + 30;
    const ins = db.raw.prepare("INSERT INTO index_daily (index_name, date, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)");
    const series: [string, number, number][] = [["Nifty 50", 0.0005, 1000], ["Nifty IT", 0.003, 3000], ["Nifty Bank", 0.001, 1500], ["Nifty Metal", -0.002, 500], ["Nifty Pharma", 0.0008, 1200]];
    for (const [name, rate, vol] of series) for (let i = 0; i < n; i++) {
      const c = 1000 * Math.exp(rate * i);
      ins.run(name, day(i), c, c * 1.01, c * 0.99, c, vol);
    }
    const env = { DB: db, PUBLIC_SITE_ORIGIN: "https://arthscan.me", TOKEN_PEPPER: "p", INTERNAL_API_KEY: "i", FREE_DAILY_QUOTA: "50" };
    const res = await app.fetch(new Request("https://x/v1/market/sector-matrix?lens=trend&timeframe=daily&benchmark=nifty50&size=rvol", { headers: { "x-internal-key": "i" } }), env as never);
    const body = (await res.json()) as any;
    expect(body.error ?? null).toBeNull();
    const d = body.data;
    expect(res.status).toBe(200);
    expect(d).toMatchObject({ timeframe: "daily", size_by: "rvol", benchmark: { name: "Nifty 50" }, lens: { key: "trend" } });
    expect(d.sectors.map((s: any) => s.name).sort()).toEqual(["Bank", "IT", "Metal", "Pharma"]);
    expect(d.sectors.find((s: any) => s.name === "IT").x).toBeGreaterThan(d.sectors.find((s: any) => s.name === "Metal").x);
    expect(d.markdown).toContain("**Lens:** Trend quality");
    expect(d.markdown).toContain("| IT |");
    // Leaving everything out gives the defaults; an unknown lens is rejected, not guessed.
    const dflt = ((await (await app.fetch(new Request("https://x/v1/market/sector-matrix", { headers: { "x-internal-key": "i" } }), env as never)).json()) as any).data;
    expect(dflt.lens.key).toBe("classic");
    expect(dflt.timeframe).toBe("weekly");
    const bad = await app.fetch(new Request("https://x/v1/market/sector-matrix?lens=bogus", { headers: { "x-internal-key": "i" } }), env as never);
    expect(bad.status).toBe(400);
  });
});
