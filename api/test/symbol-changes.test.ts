import { beforeEach, describe, expect, it } from "vitest";
import { migrate, SqliteDatabase } from "../src/db/sqlite.js";
import type { Env } from "../src/env.js";
import { applySymbolChanges, findSymbolChanges } from "../src/jobs/symbol-changes.js";
import { recomputeMetrics } from "../src/jobs/daily.js";
import { TOOLS_BY_NAME } from "../src/handlers/tools.js";

const db = new SqliteDatabase(":memory:");
const env = { DB: db } as unknown as Env;
const callTool = (name: string, args: Record<string, unknown>) => TOOLS_BY_NAME.get(name)!.handler(db, args, env);
const count = (t: string, s: string) => (db.raw.prepare(`SELECT COUNT(*) n FROM ${t} WHERE symbol = ?`).get(s) as { n: number }).n;
const stock = (symbol: string, name: string, isin: string, extra = "NULL") =>
  db.raw.exec(`INSERT INTO stocks (symbol, name, isin, sector) VALUES ('${symbol}', '${name}', '${isin}', ${extra});`);
const price = (symbol: string, date: string, close: number) =>
  db.raw.exec(`INSERT INTO daily_prices (symbol, date, close, prev_close, volume, turnover) VALUES ('${symbol}', '${date}', ${close}, ${close}, 100, 1000);`);

beforeEach(() => {
  migrate(db);
  db.raw.exec(`DELETE FROM symbol_changes; DELETE FROM daily_prices; DELETE FROM stock_metrics; DELETE FROM stocks; DELETE FROM price_adjustments;
    DELETE FROM financials; DELETE FROM shareholding; DELETE FROM results_checks; DELETE FROM fo_ban; DELETE FROM fo_oi; DELETE FROM company_statements;`);
  stock("OLDCO", "OLD CO LTD", "INE000000001", "'Metals'");
  stock("NEWCO", "New Co Limited", "INE000000001");
  stock("OTHER", "Other Limited", "INE000000002");
  price("OLDCO", "2026-10-29", 100);
  price("OLDCO", "2026-10-30", 110);
  price("NEWCO", "2026-11-02", 112);
  price("OTHER", "2026-11-02", 50);
});

describe("finding ticker changes", () => {
  it("pairs an old symbol with the new one that replaced it", async () => {
    expect((await findSymbolChanges(env)).changes).toEqual([
      { oldSymbol: "OLDCO", newSymbol: "NEWCO", isin: "INE000000001", oldName: "OLD CO LTD", changedOn: "2026-11-02" }]);
  });
  it("leaves two symbols that traded in the same period", async () => {
    price("OLDCO", "2026-11-02", 111);
    const r = await findSymbolChanges(env);
    expect(r.changes).toEqual([]);
    expect(r.skipped[0]).toMatchObject({ symbols: ["OLDCO", "NEWCO"], reason: "both traded in the same period" });
  });
  it("leaves a long gap", async () => {
    db.raw.exec("UPDATE daily_prices SET date = '2026-08-01' WHERE symbol = 'OLDCO' AND date = '2026-10-30'; DELETE FROM daily_prices WHERE date = '2026-10-29'");
    expect((await findSymbolChanges(env)).skipped[0].reason).toMatch(/days between/);
  });
  it("leaves a price jump at the change, which may be a split", async () => {
    db.raw.exec("UPDATE daily_prices SET close = 55 WHERE symbol = 'NEWCO'");
    expect((await findSymbolChanges(env)).skipped[0].reason).toMatch(/price jumped/);
  });
});

describe("merging a ticker change", () => {
  it("moves the history, fills blanks in the master, and retires the old symbol", async () => {
    const r = await applySymbolChanges(env);
    expect(r.merged.map((m) => m.oldSymbol)).toEqual(["OLDCO"]);
    expect(count("daily_prices", "NEWCO")).toBe(3);
    expect(count("daily_prices", "OLDCO")).toBe(0);
    expect(count("stocks", "OLDCO")).toBe(0);
    expect(db.raw.prepare("SELECT name, sector FROM stocks WHERE symbol = 'NEWCO'").get()).toEqual({ name: "New Co Limited", sector: "Metals" });
    expect(db.raw.prepare("SELECT old_symbol, new_symbol, changed_on FROM symbol_changes").all()).toEqual([{ old_symbol: "OLDCO", new_symbol: "NEWCO", changed_on: "2026-11-02" }]);
  });
  it("moves every per-symbol table, and the new symbol's row wins a clash", async () => {
    db.raw.exec(`INSERT INTO shareholding (symbol, quarter_end, promoter) VALUES ('OLDCO', '2026-06-30', 40), ('OLDCO', '2026-09-30', 41), ('NEWCO', '2026-09-30', 42);
      INSERT INTO fo_ban (date, symbol) VALUES ('2026-10-30', 'OLDCO');
      INSERT INTO price_adjustments (symbol, ex_date, factor, source) VALUES ('OLDCO', '2026-01-05', 0.5, 'detected');
      INSERT INTO stock_metrics (symbol, as_of, close) VALUES ('OLDCO', '2026-10-30', 110);`);
    await applySymbolChanges(env);
    expect(db.raw.prepare("SELECT quarter_end, promoter FROM shareholding WHERE symbol = 'NEWCO' ORDER BY 1").all()).toEqual([{ quarter_end: "2026-06-30", promoter: 40 }, { quarter_end: "2026-09-30", promoter: 42 }]);
    for (const t of ["shareholding", "fo_ban", "price_adjustments", "stock_metrics"]) expect(count(t, "OLDCO")).toBe(0);
    expect(count("fo_ban", "NEWCO")).toBe(1);
    expect(count("price_adjustments", "NEWCO")).toBe(1);
  });
  it("applies a split made since the change to the older rows", async () => {
    db.raw.exec("INSERT INTO price_adjustments (symbol, ex_date, factor, source) VALUES ('NEWCO', '2026-11-02', 0.5, 'detected')");
    await applySymbolChanges(env);
    expect(db.raw.prepare("SELECT date, adj FROM daily_prices WHERE symbol = 'NEWCO' ORDER BY date").all()).toEqual([
      { date: "2026-10-29", adj: 0.5 }, { date: "2026-10-30", adj: 0.5 }, { date: "2026-11-02", adj: 1 }]);
  });
  it("keeps real statements over an empty lookup under the new symbol", async () => {
    db.raw.exec(`INSERT INTO company_statements (symbol, body, fetched_at, found) VALUES ('OLDCO', 'real', 1, 1), ('NEWCO', '', 2, 0)`);
    await applySymbolChanges(env);
    expect(db.raw.prepare("SELECT symbol, body FROM company_statements").all()).toEqual([{ symbol: "NEWCO", body: "real" }]);
  });
  it("does one symbol when asked, and repeats safely", async () => {
    stock("OLD2", "Old Two", "INE000000003");
    stock("NEW2", "New Two", "INE000000003");
    price("OLD2", "2026-10-30", 10);
    price("NEW2", "2026-11-02", 10);
    expect((await applySymbolChanges(env, { only: "OLD2" })).merged.map((m) => m.newSymbol)).toEqual(["NEW2"]);
    expect(count("stocks", "OLDCO")).toBe(1);
    await applySymbolChanges(env);
    expect((await applySymbolChanges(env)).merged).toEqual([]);
  });
  it("points earlier renames at the latest symbol", async () => {
    await applySymbolChanges(env);
    stock("NEWER", "Newer Limited", "INE000000001");
    price("NEWER", "2026-11-03", 113);
    await applySymbolChanges(env);
    expect(db.raw.prepare("SELECT old_symbol, new_symbol FROM symbol_changes ORDER BY 1").all()).toEqual([{ old_symbol: "NEWCO", new_symbol: "NEWER" }, { old_symbol: "OLDCO", new_symbol: "NEWER" }]);
  });
  it("recomputes metrics for only the merged stock, over the whole history", async () => {
    await applySymbolChanges(env);
    const r = await recomputeMetrics(env, ["NEWCO"]);
    expect(r.rows).toBe(1);
    expect(count("stock_metrics", "NEWCO")).toBe(1);
    expect(count("stock_metrics", "OTHER")).toBe(0);
    expect(db.raw.prepare("SELECT high_52w, low_52w FROM stock_metrics WHERE symbol = 'NEWCO'").get()).toMatchObject({ low_52w: 100 });
  });
});

describe("after a merge", () => {
  it("still finds the company by its old ticker and old name", async () => {
    await applySymbolChanges(env);
    const search = (query: string) => callTool("search_stocks", { query }) as Promise<{ results: { symbol: string }[] }>;
    expect((await search("OLDCO")).results.map((r) => r.symbol)).toEqual(["NEWCO"]);
    expect((await search("old co")).results.map((r) => r.symbol)).toEqual(["NEWCO"]);
  });
  it("answers an old ticker with the company under its current symbol", async () => {
    await applySymbolChanges(env);
    expect(await callTool("get_company", { symbol: "oldco" })).toMatchObject({ symbol: "NEWCO", name: "New Co Limited" });
  });
  it("lets a symbol reused by another company answer as itself", async () => {
    await applySymbolChanges(env);
    stock("OLDCO", "Reused Limited", "INE000000009");
    expect(await callTool("get_company", { symbol: "OLDCO" })).toMatchObject({ symbol: "OLDCO", name: "Reused Limited" });
  });
});
