import { rmSync } from 'node:fs';
import { runMigrations } from '@/lib/db/migrate';

/**
 * Builds a fresh database for a test file. The directory is removed first so
 * every run starts from the same known state rather than inheriting rows from
 * a previous run.
 */
export async function freshDatabase() {
  const dir = process.env.PGLITE_DATA_DIR!;
  rmSync(dir, { recursive: true, force: true });
  rmSync(`${dir}.lock`, { force: true });
  await runMigrations({ silent: true });
}
