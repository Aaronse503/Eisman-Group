export interface QueryResultLike {
  rows: unknown[];
  affectedRows?: number;
}

/** Minimal database surface shared by the Postgres and PGlite drivers. */
export interface Db {
  /** Parameterised query. Placeholders are `$1`-style on both drivers. */
  query<T = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<T[]>;
  /** Runs one or more statements with no parameters (DDL, migrations). */
  exec(text: string): Promise<void>;
  /** Runs `fn` inside a transaction; rolls back if it throws. */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  /** Which driver is active — surfaced in the UI and in /api/health. */
  readonly driver: 'postgres' | 'pglite';
}
