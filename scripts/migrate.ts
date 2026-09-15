import { config } from 'dotenv';
import { runMigrations } from '../src/lib/db/migrate';

config({ path: '.env.local', quiet: true });
config({ quiet: true });

async function main() {
  console.log('Running migrations...');
  const result = await runMigrations();
  console.log(
    result.ran.length
      ? `Applied ${result.ran.length} migration(s) on ${result.driver}.`
      : `Schema already up to date on ${result.driver} (${result.total} migrations).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
