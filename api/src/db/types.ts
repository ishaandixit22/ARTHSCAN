// The subset of Cloudflare D1's API that the app uses. Locally it is backed by
// node:sqlite (see sqlite.ts); on Workers the real D1 binding satisfies it as-is,
// so no handler changes when we move to Cloudflare.

export interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: { changes: number; last_row_id: number };
}

export interface PreparedStatement {
  bind(...values: unknown[]): PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface Database {
  prepare(sql: string): PreparedStatement;
  batch(statements: PreparedStatement[]): Promise<D1Result[]>;
  exec(sql: string): Promise<unknown>;
}
