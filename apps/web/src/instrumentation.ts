/**
 * Runs once when the server starts, before it serves anything.
 *
 * This is where a misconfigured production deployment is stopped. The
 * alternative — booting anyway — means a system that looks like it is working
 * while sessions are signed with a development default, or uploads are being
 * written to a filesystem that is about to be discarded. A refusal that names
 * the missing variable is the kinder failure.
 */
export async function register() {
  // Only the Node runtime has an environment worth checking; the edge runtime
  // gets its own, much smaller, set of variables.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // Building is not running. A build machine legitimately has no database.
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  if (process.env.NODE_ENV !== 'production') return;

  const { getEnv, productionEnvProblems } = await import('@/lib/env');
  const problems = productionEnvProblems(getEnv());
  if (problems.length === 0) return;

  // The end-to-end suite runs a production build against the embedded
  // database, which these checks rightly forbid for a real deployment. The
  // name is deliberately hard to set by accident or to justify in a review,
  // and taking it is announced rather than silent.
  if (process.env.UNSAFE_ALLOW_UNCONFIGURED_PRODUCTION === '1') {
    console.warn(
      'UNSAFE_ALLOW_UNCONFIGURED_PRODUCTION is set: starting despite ' +
        `${problems.length} configuration problem(s). Never set this on a deployment.`,
    );
    for (const problem of problems) console.warn(`  - ${problem}`);
    return;
  }

  const message = [
    'This deployment is not configured correctly and will not be served:',
    ...problems.map((p) => `  - ${p}`),
    '',
    'Set these in the host’s environment settings, not in a file in the repository.',
    'See DEPLOYMENT.md.',
  ].join('\n');

  console.error(message);
  throw new Error(message);
}
