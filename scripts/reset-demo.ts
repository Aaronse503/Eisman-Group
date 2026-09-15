import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
config({ quiet: true });

import { resetDemoData, seedAll, demoCounts } from '../src/lib/seed';
import { getEnv } from '../src/lib/env';

async function main() {
  const env = getEnv();
  if (env.DISABLE_DEMO_DATA) {
    console.error('DISABLE_DEMO_DATA is set. Refusing to touch demo data on this deployment.');
    process.exit(1);
  }
  const reseed = !process.argv.includes('--clear-only');

  console.log('Removing rows flagged is_demo = true. Production records are untouched.');
  const deleted = await resetDemoData();
  const total = Object.values(deleted).reduce((a, b) => a + b, 0);
  console.log(`Removed ${total} demo row(s) across ${Object.keys(deleted).length} table(s).`);

  if (reseed) {
    console.log('\nRe-seeding demo data…');
    await seedAll({ demo: true });
    const counts = await demoCounts();
    console.log('Demo records recreated:');
    for (const [table, count] of Object.entries(counts)) console.log(`  ${table.padEnd(16)} ${count}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});
