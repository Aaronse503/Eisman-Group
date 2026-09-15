import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
config({ quiet: true });

import { seedAll, demoCounts } from '../src/lib/seed';
import { getEnv } from '../src/lib/env';
import { DEMO_PASSWORD } from '../src/lib/seed/core';

async function main() {
  const env = getEnv();
  const demo = !env.DISABLE_DEMO_DATA && process.argv.includes('--no-demo') === false;

  console.log(`Seeding (demo data: ${demo ? 'yes' : 'no'})…`);
  const started = Date.now();
  const { ctx, seededDemo } = await seedAll({ demo });

  console.log(`\nHolding: ${ctx.holdingId}`);
  for (const [slug, id] of Object.entries(ctx.companies)) console.log(`  company ${slug} → ${id}`);

  if (seededDemo) {
    const counts = await demoCounts();
    console.log('\nDemo records created:');
    for (const [table, count] of Object.entries(counts)) {
      console.log(`  ${table.padEnd(16)} ${count}`);
    }
    console.log(`\nDemo sign-in password for every demo account: ${DEMO_PASSWORD}`);
  }
  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
