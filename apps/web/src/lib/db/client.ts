import type { Db } from './types';

/**
 * Two drivers, one SQL dialect.
 *
 *  - `postgres`: used whenever DATABASE_URL is set (Supabase, RDS, local PG).
 *  - `pglite`:   an embedded Postgres 17 (WASM) stored under `.data/pglite`,
 *                used when no DATABASE_URL is configured so the app is
 *                fully runnable with zero credentials.
 *
 * The same migrations run against both, so nothing is simulated: local
 * development exercises real Postgres semantics including RLS.
 */

const NUMERIC_OID = 1700;
const INT8_OID = 20;
const DATE_OID = 1082;

const parseNumeric = (v: string) => (v === null ? null : Number.parseFloat(v));
const parseInt8 = (v: string) => (v === null ? null : Number.parseInt(v, 10));
const parseDate = (v: string) => v; // keep `date` as an ISO string; no TZ drift

let instance: Promise<Db> | null = null;

async function createPostgres(connectionString: string): Promise<Db> {
  const pg = await import('pg');
  const { types, Pool } = pg.default ?? pg;
  types.setTypeParser(NUMERIC_OID, parseNumeric as never);
  types.setTypeParser(INT8_OID, parseInt8 as never);
  types.setTypeParser(DATE_OID, parseDate as never);

  const pool = new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    // Set on the connection itself rather than by issuing a statement after
    // it opens: a query fired from the pool's 'connect' event races the first
    // real query on that client, and can lose.
    options: '-c app.service_role=on',
    ssl: /\bsslmode=disable\b/.test(connectionString)
      ? false
      : connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false },
  });

  // The application connection is the trusted service role: authorization is
  // enforced in src/lib/rbac. `asUser()` turns it off transaction-locally so
  // RLS policies apply, which is how the RLS tests run.

  const wrap = (runner: {
    query: (text: string, params?: readonly unknown[]) => Promise<{ rows: unknown[] }>;
  }): Db => ({
    driver: 'postgres',
    async query<T>(text: string, params: readonly unknown[] = []) {
      const res = await runner.query(text, params);
      return res.rows as T[];
    },
    async exec(text: string) {
      await runner.query(text);
    },
    async transaction<T>(): Promise<T> {
      throw new Error('nested transactions are not supported');
    },
  });

  const base: Db = {
    driver: 'postgres',
    async query<T>(text: string, params: readonly unknown[] = []) {
      const res = await pool.query(text, params as unknown[]);
      return res.rows as T[];
    },
    async exec(text: string) {
      await pool.query(text);
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await fn(wrap(client));
        await client.query('commit');
        return result;
      } catch (err) {
        try {
          await client.query('rollback');
        } catch {
          /* connection already broken */
        }
        throw err;
      } finally {
        client.release();
      }
    },
  };
  return base;
}

export class PgliteLockedError extends Error {
  constructor(readonly holderPid: number, readonly dataDir: string) {
    super(
      `The embedded database at ${dataDir} is already open in process ${holderPid}.\n` +
        `PGlite is single-process: stop the other process (usually \`npm run dev\`) and try again, ` +
        `or set DATABASE_URL to run against a real Postgres server instead.`,
    );
    this.name = 'PgliteLockedError';
  }
}

/**
 * PGlite is an in-process Postgres and allows exactly one process per data
 * directory. Two openers corrupt the instance, so take an explicit lock:
 *
 *  - if a live process holds it, fail with an actionable message;
 *  - if the holder is gone (a crash), clear its stale postmaster.pid and take over.
 */
function acquirePgliteLock(dataDir: string) {
  // Required lazily: this module is also loaded in environments where the node
  // builtins must not be pulled into the bundle unless PGlite is actually used.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs') as typeof import('node:fs');
  const { dirname, join, resolve } = require('node:path') as typeof import('node:path');
  /* eslint-enable @typescript-eslint/no-require-imports */
  // The lock lives *beside* the data directory, never inside it: initdb
  // refuses to initialise a directory that already contains a file.
  const resolved = resolve(dataDir);
  mkdirSync(dirname(resolved), { recursive: true });
  const lockPath = `${resolved}.lock`;

  if (existsSync(lockPath)) {
    const holder = Number.parseInt(readFileSync(lockPath, 'utf8').trim(), 10);
    if (Number.isFinite(holder) && holder !== process.pid) {
      // A holder that has just been signalled is still writing for a moment.
      // Opening the directory in that window is what actually corrupts it, so
      // wait for the process to go before deciding anything.
      const deadline = Date.now() + 10_000;
      let alive = true;
      while (alive && Date.now() < deadline) {
        try {
          process.kill(holder, 0);
          // Busy-wait deliberately: this runs before any database work, in a
          // process that has nothing else to do yet, and must not yield to
          // code that would try to open the database again.
          const until = Date.now() + 100;
          while (Date.now() < until) { /* spin */ }
        } catch {
          alive = false;
        }
      }
      if (alive) throw new PgliteLockedError(holder, dataDir);
      // Give the operating system a moment to flush the departed process's
      // writes before reading the directory.
      const settle = Date.now() + 250;
      while (Date.now() < settle) { /* spin */ }
    }
    // Stale: the previous owner died without cleaning up.
    rmSync(join(resolved, 'postmaster.pid'), { force: true });
  }

  mkdirSync(resolved, { recursive: true });
  writeFileSync(lockPath, String(process.pid));
  const release = () => rmSync(lockPath, { force: true });
  process.once('exit', release);
  process.once('SIGINT', () => {
    release();
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    release();
    process.exit(143);
  });
}

async function createPglite(dataDir: string): Promise<Db> {
  acquirePgliteLock(dataDir);
  const { PGlite } = await import('@electric-sql/pglite');
  const options = {
    parsers: {
      [NUMERIC_OID]: parseNumeric,
      [INT8_OID]: parseInt8,
      [DATE_OID]: parseDate,
    },
  };

  let pg: InstanceType<typeof PGlite>;
  try {
    pg = await PGlite.create(dataDir, options);
  } catch (err) {
    // The WASM runtime aborts rather than raising a readable error when the
    // data directory is damaged (almost always: two processes opened it).
    throw new Error(
      `Could not open the embedded database at ${dataDir}. ` +
        `This usually means the directory was left in a bad state by a second process. ` +
        `Rebuild it with:  npm run db:nuke && npm run setup  ` +
        `(local demo data only — nothing in a real Postgres database is affected). ` +
        `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
  // See the note on the pg pool above: the base connection is the service role.
  await pg.exec(`set app.service_role = 'on'`);

  // PGlite is a single in-process connection, so concurrent transactions must
  // be serialised. Every query goes through this queue to keep ordering sane
  // under Next.js request concurrency.
  let chain: Promise<unknown> = Promise.resolve();
  const serialize = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => undefined);
    return next;
  };

  const base: Db = {
    driver: 'pglite',
    async query<T>(text: string, params: readonly unknown[] = []) {
      return serialize(async () => {
        const res = await pg.query<T>(text, params as unknown[]);
        return res.rows;
      });
    },
    async exec(text: string) {
      await serialize(() => pg.exec(text));
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      return serialize(
        () =>
          pg.transaction(async (tx) => {
            const inner: Db = {
              driver: 'pglite',
              async query<R>(text: string, params: readonly unknown[] = []) {
                const res = await tx.query<R>(text, params as unknown[]);
                return res.rows;
              },
              async exec(text: string) {
                await tx.exec(text);
              },
              async transaction<R>(): Promise<R> {
                throw new Error('nested transactions are not supported');
              },
            };
            return fn(inner);
          }) as Promise<T>,
      );
    },
  };
  return base;
}

export function getDb(): Promise<Db> {
  if (!instance) {
    const url = process.env.DATABASE_URL?.trim();
    instance = url
      ? createPostgres(url)
      : createPglite(process.env.PGLITE_DATA_DIR?.trim() || '.data/pglite');
  }
  return instance;
}

/** Test helper: drops the cached connection so a new one is created. */
export function resetDbForTests() {
  instance = null;
}

/** Convenience wrapper used by nearly all repository code. */
export async function sql<T = Record<string, unknown>>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const db = await getDb();
  return db.query<T>(text, params);
}

export async function one<T = Record<string, unknown>>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  const rows = await sql<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Runs `fn` with the connection marked as the trusted service role, which
 * bypasses RLS. Authorization for these paths is enforced in `src/lib/rbac`.
 */
export async function asService<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('app.service_role', 'on', true)`);
    return fn(tx);
  });
}

/** Runs `fn` inside a transaction on the shared service connection. */
export async function tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  return asService(fn);
}

/** Runs `fn` as a specific user so RLS policies apply. Used by RLS tests. */
export async function asUser<T>(userId: string | null, fn: (db: Db) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    // SET LOCAL ROLE drops superuser/owner status for the rest of the
    // transaction, which is what makes the RLS policies actually apply.
    await tx.query(`set local role app_user`);
    await tx.query(`select set_config('app.service_role', 'off', true)`);
    await tx.query(`select set_config('app.user_id', $1, true)`, [userId ?? '']);
    return fn(tx);
  });
}
