// node:sqlite implementation of the D1-shaped Database interface.

import type { DatabaseSync as DatabaseSyncT, StatementSync } from "node:sqlite";
import { createRequire } from "node:module";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { D1Result, Database, PreparedStatement } from "./types.js";

// Loaded via require: some bundlers (vitest's vite) don't know node:sqlite yet.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
type DatabaseSync = DatabaseSyncT;

type SqlValue = string | number | bigint | null | Uint8Array;

function toSql(v: unknown): SqlValue {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string" || typeof v === "number" || typeof v === "bigint") return v;
  if (v instanceof Uint8Array) return v;
  return String(v);
}

class Statement implements PreparedStatement {
  constructor(
    private db: DatabaseSync,
    private sql: string,
    private params: SqlValue[] = [],
  ) {}

  private stmt(): StatementSync {
    return this.db.prepare(this.sql);
  }

  bind(...values: unknown[]): PreparedStatement {
    return new Statement(this.db, this.sql, values.map(toSql));
  }

  async first<T>(): Promise<T | null> {
    return (this.stmt().get(...this.params) as T | undefined) ?? null;
  }

  async all<T>(): Promise<D1Result<T>> {
    const rows = this.stmt().all(...this.params) as T[];
    return { results: rows, success: true, meta: { changes: 0, last_row_id: 0 } };
  }

  async run(): Promise<D1Result> {
    const r = this.stmt().run(...this.params);
    return {
      results: [],
      success: true,
      meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) },
    };
  }

  runSync(): void {
    this.stmt().run(...this.params);
  }
}

export class SqliteDatabase implements Database {
  readonly raw: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.raw = new DatabaseSync(path);
    this.raw.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  }

  prepare(sql: string): PreparedStatement {
    return new Statement(this.raw, sql);
  }

  // D1 runs a batch as one transaction; match that.
  async batch(statements: PreparedStatement[]): Promise<D1Result[]> {
    this.raw.exec("BEGIN");
    try {
      const out: D1Result[] = [];
      for (const s of statements) out.push(await s.run());
      this.raw.exec("COMMIT");
      return out;
    } catch (err) {
      this.raw.exec("ROLLBACK");
      throw err;
    }
  }

  async exec(sql: string): Promise<unknown> {
    this.raw.exec(sql);
    return undefined;
  }
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export function defaultDbPath(): string {
  return resolve(ROOT, process.env.DATABASE_PATH ?? "./data/arthlens.db");
}

let shared: SqliteDatabase | null = null;

export function openDatabase(path = defaultDbPath()): SqliteDatabase {
  if (!shared) {
    shared = new SqliteDatabase(path);
    migrate(shared);
  }
  return shared;
}

// Applies api/migrations/*.sql in order, once each. Same files `wrangler d1
// migrations apply` will use on Cloudflare.
export function migrate(db: SqliteDatabase): string[] {
  db.raw.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))",
  );
  const dir = join(ROOT, "api/migrations");
  const done = new Set(
    (db.raw.prepare("SELECT name FROM _migrations").all() as { name: string }[]).map((r) => r.name),
  );
  const applied: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    db.raw.exec("BEGIN");
    try {
      db.raw.exec(readFileSync(join(dir, file), "utf8"));
      db.raw.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
      db.raw.exec("COMMIT");
      applied.push(file);
    } catch (err) {
      db.raw.exec("ROLLBACK");
      throw err;
    }
  }
  return applied;
}
