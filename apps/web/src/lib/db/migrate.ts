import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { getDb } from './client';

/**
 * The migrations live at the top of the repository and are shared by both
 * applications, so find them by walking up rather than assuming the working
 * directory.
 *
 * This is deliberately lazy and returns null rather than throwing. On a
 * serverless host the application runs from a bundle, and whether the SQL
 * files came with it is a question to answer at the point of use — a missing
 * directory must not stop the module from loading, or every request fails
 * before it reaches a line of application code.
 */
export class MigrationsUnavailableError extends Error {
  constructor(from: string) {
    super(
      `Could not find db/migrations (looked upwards from ${from}). ` +
        `Apply migrations from a checkout instead:  DATABASE_URL="…" npm run db:migrate`,
    );
    this.name = 'MigrationsUnavailableError';
  }
}

function findMigrationsDir(): string | null {
  // Both the working directory and this file's own location: a traced
  // serverless bundle puts the files beside the code, not beside the cwd.
  const starts = [resolve(process.cwd())];
  try {
    starts.push(resolve(dirname(new URL(import.meta.url).pathname)));
  } catch {
    /* no module URL (bundled to CJS); the working directory is enough */
  }

  for (const start of starts) {
    let dir = start;
    for (let i = 0; i < 8; i++) {
      const candidate = join(dir, 'db', 'migrations');
      if (existsSync(candidate)) return candidate;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

let migrationsDir: string | null | undefined;

/** Where the SQL files are, or null if they did not come with this build. */
export function migrationsDirectory(): string | null {
  if (migrationsDir === undefined) migrationsDir = findMigrationsDir();
  return migrationsDir;
}

/** True when the schema is already present, whatever applied it. */
async function schemaIsPresent(): Promise<boolean> {
  const db = await getDb();
  const rows = await db.query<{ present: boolean }>(
    `select to_regclass('public.schema_migrations') is not null as present`,
  );
  if (!rows[0]?.present) return false;
  const applied = await db.query<{ count: number }>(
    `select count(*)::int as count from schema_migrations`,
  );
  return (applied[0]?.count ?? 0) > 0;
}

/** Arbitrary but fixed: any number works as long as nothing else uses it. */
const MIGRATION_LOCK_KEY = 8_531_207;

export interface AppliedMigration {
  name: string;
  checksum: string;
  applied_at: Date;
}

/**
 * Applies every unapplied file in db/migrations in filename order, inside a
 * transaction per file. Checksums are recorded so an edited, already-applied
 * migration fails loudly instead of silently diverging.
 */
export async function runMigrations(opts: { silent?: boolean } = {}) {
  const dir = migrationsDirectory();
  if (!dir) throw new MigrationsUnavailableError(process.cwd());

  const db = await getDb();
  await db.exec(`
    create table if not exists schema_migrations (
      name       text primary key,
      checksum   text not null,
      applied_at timestamptz not null default now()
    );
  `);

  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const applied = await db.query<AppliedMigration>('select name, checksum from schema_migrations');
  const appliedByName = new Map(applied.map((m) => [m.name, m.checksum]));
  const pending: { file: string; body: string; checksum: string }[] = [];

  for (const file of files) {
    const body = await readFile(join(dir, file), 'utf8');
    const checksum = createHash('sha256').update(body).digest('hex').slice(0, 32);
    const previous = appliedByName.get(file);

    if (previous) {
      if (previous !== checksum) {
        throw new Error(
          `Migration ${file} changed after it was applied (checksum ${previous} -> ${checksum}). ` +
            `Add a new migration instead of editing an applied one.`,
        );
      }
      continue;
    }
    pending.push({ file, body, checksum });
  }

  if (pending.length > 0) {
    // One transaction for the whole run, holding an advisory lock.
    //
    // A deployment that starts several instances at once would otherwise have
    // two of them apply migration 0001 simultaneously, and one would fail on
    // a table the other had just created. The lock is released when the
    // transaction ends, however it ends. PGlite is a single connection, so
    // there is nothing there to race with and no lock to take.
    await db.transaction(async (tx) => {
      if (db.driver === 'postgres') {
        await tx.query('select pg_advisory_xact_lock($1)', [MIGRATION_LOCK_KEY]);
        // Another instance may have applied them while this one waited.
        const nowApplied = await tx.query<{ name: string }>('select name from schema_migrations');
        const names = new Set(nowApplied.map((m) => m.name));
        if (pending.every((p) => names.has(p.file))) return;
      }
      for (const { file, body, checksum } of pending) {
        await tx.exec(body);
        await tx.query('insert into schema_migrations (name, checksum) values ($1, $2)', [
          file,
          checksum,
        ]);
        if (!opts.silent) console.log(`  ✓ ${file}`);
      }
    });
  }

  return { ran: pending.map((p) => p.file), total: files.length, driver: db.driver };
}

let migrated: Promise<unknown> | null = null;

/**
 * Ensures the schema is present before the first query of a process. Safe to
 * call on every request: the work happens once per process.
 *
 * Where the SQL files did not come with the build — a serverless bundle that
 * did not trace them — this checks that someone has already applied them
 * rather than failing. A schema that is there is the thing that matters; how
 * it got there is not. A schema that is *not* there says so, and says what to
 * run, instead of returning a page of stack trace.
 */
export function ensureMigrated() {
  if (!migrated) {
    migrated = (async () => {
      if (migrationsDirectory()) return runMigrations({ silent: true });
      if (await schemaIsPresent()) return { ran: [], total: 0, skipped: 'no migration files' };
      throw new MigrationsUnavailableError(process.cwd());
    })().catch((err) => {
      // A failure must not be cached as a resolved promise, or the process
      // spends its life believing a broken database is fine.
      migrated = null;
      throw err;
    });
  }
  return migrated;
}

export function resetMigrationStateForTests() {
  migrated = null;
}
