import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { getDb } from './client';

const MIGRATIONS_DIR = join(process.cwd(), 'db', 'migrations');

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
  const db = await getDb();
  await db.exec(`
    create table if not exists schema_migrations (
      name       text primary key,
      checksum   text not null,
      applied_at timestamptz not null default now()
    );
  `);

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const applied = await db.query<AppliedMigration>('select name, checksum from schema_migrations');
  const appliedByName = new Map(applied.map((m) => [m.name, m.checksum]));
  const ran: string[] = [];

  for (const file of files) {
    const body = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
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

    await db.transaction(async (tx) => {
      await tx.exec(body);
      await tx.query('insert into schema_migrations (name, checksum) values ($1, $2)', [
        file,
        checksum,
      ]);
    });
    ran.push(file);
    if (!opts.silent) console.log(`  ✓ ${file}`);
  }

  return { ran, total: files.length, driver: db.driver };
}

let migrated: Promise<unknown> | null = null;

/**
 * Ensures the schema is present before the first query of a process. Safe to
 * call on every request: the work happens once per process.
 */
export function ensureMigrated() {
  if (!migrated) migrated = runMigrations({ silent: true });
  return migrated;
}

export function resetMigrationStateForTests() {
  migrated = null;
}
