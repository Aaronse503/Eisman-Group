import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
config({ quiet: true });

import { sql } from '../../src/lib/db/client';

/**
 * Puts the end-to-end database into a known state.
 *
 * The owner starts on a temporary password, which the application insists on
 * replacing before anything else can be used. That is the behaviour under
 * test, but it cannot be the starting state for every other spec, so the flag
 * is cleared for the owner and moved to one demo account that only the
 * forced-change test signs in as.
 */
async function main() {
  await sql(`update users set must_change_password = false where email = 'aaron@eismandigital.com'`);
  await sql(`update users set must_change_password = true where email = 'sam.design@demo.eisman.test'`);
  console.log('e2e fixtures ready');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
