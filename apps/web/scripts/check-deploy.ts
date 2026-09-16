import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
config({ quiet: true });

/**
 * Checks a deployment's configuration before the deployment does.
 *
 * Run it on your own machine with the values you are about to paste into the
 * host, and it tells you which one is wrong while that is still cheap:
 *
 *     DATABASE_URL="…" SUPABASE_URL="…" … npm run check:deploy
 *
 * Nothing is written anywhere except one temporary file in the storage bucket,
 * which is read back and deleted — that round trip is the only way to know an
 * upload will actually work. Secrets are never printed; where a value has to
 * be shown it is shown as a length or a few characters.
 */

type Level = 'ok' | 'warn' | 'fail';
const results: { level: Level; title: string; detail?: string }[] = [];

const record = (level: Level, title: string, detail?: string) =>
  results.push({ level, title, detail });
const ok = (title: string, detail?: string) => record('ok', title, detail);
const warn = (title: string, detail?: string) => record('warn', title, detail);
const fail = (title: string, detail?: string) => record('fail', title, detail);

const env = process.env;

function checkSecrets() {
  const authSecret = env.AUTH_SECRET ?? '';
  if (!authSecret) fail('AUTH_SECRET is not set', 'Generate one:  openssl rand -base64 48');
  else if (authSecret.length < 32)
    fail('AUTH_SECRET is too short', `It is ${authSecret.length} characters; 32 is the minimum.`);
  else ok('AUTH_SECRET', `${authSecret.length} characters`);

  const key = env.ENCRYPTION_KEY ?? '';
  if (!key) {
    fail('ENCRYPTION_KEY is not set', 'Generate one:  openssl rand -base64 32');
  } else {
    const bytes = Buffer.from(key, 'base64');
    if (bytes.length !== 32) {
      fail(
        'ENCRYPTION_KEY is not 32 bytes',
        `It decodes to ${bytes.length} bytes. Generate a new one:  openssl rand -base64 32`,
      );
    } else {
      ok('ENCRYPTION_KEY', '32 bytes, as required');
    }
  }

  if (!env.CRON_SECRET) {
    warn(
      'CRON_SECRET is not set',
      'Reminders will not be delivered until it is. Generate one:  openssl rand -base64 32',
    );
  } else if (env.CRON_SECRET.length < 16) {
    warn('CRON_SECRET is short', 'Use at least 16 characters.');
  } else {
    ok('CRON_SECRET', 'set');
  }
}

function checkAppSettings() {
  const appUrl = env.APP_URL;
  if (!appUrl) {
    warn('APP_URL is not set', 'Links in notifications will point at localhost.');
  } else if (!appUrl.startsWith('https://')) {
    warn('APP_URL is not https', appUrl);
  } else {
    ok('APP_URL', appUrl);
  }

  if (env.DEMO_MODE === 'false') ok('DEMO_MODE', 'off, as it should be on a deployment');
  else warn('DEMO_MODE is not false', 'Sample data would be mixed in with real records.');

  if (env.DISABLE_DEMO_DATA === 'true') ok('DISABLE_DEMO_DATA', 'demo seeding is blocked');
  else warn('DISABLE_DEMO_DATA is not true', 'The demo seed would be allowed to run.');
}

async function checkDatabase() {
  const url = env.DATABASE_URL;
  if (!url) {
    fail('DATABASE_URL is not set', 'Copy the connection pooler string from Supabase.');
    return;
  }

  // A direct connection runs out of connections under a serverless host, which
  // shows up as intermittent failures under load rather than a clean error.
  if (/db\.[a-z0-9]+\.supabase\.co/.test(url) && !/pooler/.test(url)) {
    warn(
      'DATABASE_URL looks like the direct connection, not the pooler',
      'Use the "Connection pooling" string. A serverless host opens many short-lived ' +
        'connections and will exhaust a direct one.',
    );
  }
  if (!/sslmode=/.test(url) && !/localhost|127\.0\.0\.1/.test(url)) {
    warn('DATABASE_URL has no sslmode', 'Append ?sslmode=require for a hosted database.');
  }

  try {
    const { sql } = await import('../src/lib/db/client');
    const version = await sql<{ version: string }>('select version()');
    const server = version[0]?.version?.split(' ').slice(0, 2).join(' ') ?? 'Postgres';
    ok('Database reachable', server);

    const applied = await sql<{ name: string }>(
      `select name from schema_migrations order by name`,
    ).catch(() => [] as { name: string }[]);
    const { migrationsDirectory } = await import('../src/lib/db/migrate');
    const dir = migrationsDirectory();
    const { readdir } = await import('node:fs/promises');
    const files = dir ? (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort() : [];

    if (applied.length === 0) {
      fail(
        'The schema has not been created',
        'Run:  DATABASE_URL="…" npm run db:migrate',
      );
    } else if (files.length > applied.length) {
      const names = new Set(applied.map((a) => a.name));
      const missing = files.filter((f) => !names.has(f));
      fail(
        `${missing.length} migration(s) have not been applied`,
        `${missing.join(', ')}. Run:  DATABASE_URL="…" npm run db:migrate`,
      );
    } else {
      ok('Schema', `${applied.length} migration(s) applied`);
    }

    if (applied.length > 0) {
      const owners = await sql<{ count: number }>(
        `select count(*)::int as count from user_company_roles where role = 'holdings_owner'`,
      ).catch(() => [{ count: 0 }]);
      if ((owners[0]?.count ?? 0) === 0) {
        fail(
          'There is no owner account',
          'Run:  DATABASE_URL="…" npm run db:seed -- --no-demo',
        );
      } else {
        ok('Owner account', 'exists');
      }

      const demo = await sql<{ count: number }>(
        `select count(*)::int as count from clients where is_demo`,
      ).catch(() => [{ count: 0 }]);
      if ((demo[0]?.count ?? 0) > 0) {
        warn(
          `The database contains ${demo[0]!.count} demo client(s)`,
          'Clear them under Settings → Demo data once you are signed in.',
        );
      } else {
        ok('Demo data', 'none in this database');
      }
    }
  } catch (err) {
    fail(
      'Could not connect to the database',
      err instanceof Error ? err.message.slice(0, 300) : String(err),
    );
  }
}

async function checkStorage() {
  const driver = env.STORAGE_DRIVER ?? 'local';
  if (driver !== 'supabase') {
    fail(
      `STORAGE_DRIVER is "${driver}"`,
      'A serverless host discards its filesystem between requests, so uploaded documents ' +
        'would appear to save and then be gone. Set STORAGE_DRIVER=supabase.',
    );
    return;
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    fail(
      'Supabase storage is not configured',
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are both required.',
    );
    return;
  }
  if (!env.SUPABASE_STORAGE_BUCKET) {
    warn('SUPABASE_STORAGE_BUCKET is not set', 'Defaulting to "command-center".');
  }

  // The only honest test of an upload is an upload.
  try {
    const { getStorage } = await import('../src/lib/storage');
    const storage = getStorage();
    const key = `_preflight/${Date.now()}-check.txt`;
    const body = Buffer.from('Written by npm run check:deploy. Safe to delete.\n');

    await storage.put(key, body, 'text/plain');
    const readBack = await storage.get(key);
    await storage.delete(key);

    if (readBack.equals(body)) {
      ok('File storage', 'wrote, read back and deleted a test file');
    } else {
      fail('File storage returned different content than was written');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fail(
      'File storage did not work',
      /not found|404/i.test(message)
        ? `The bucket "${env.SUPABASE_STORAGE_BUCKET ?? 'command-center'}" does not exist. ` +
          'Create it under Storage in Supabase.'
        : message.slice(0, 300),
    );
  }
}

function report() {
  const width = 66;
  const line = '─'.repeat(width);
  console.log(`\n${line}`);
  console.log('  Deployment preflight');
  console.log(line);

  const mark = { ok: '  ✓', warn: '  !', fail: '  ✗' } as const;
  for (const r of results) {
    console.log(`${mark[r.level]} ${r.title}`);
    if (r.detail) console.log(`      ${r.detail}`);
  }

  const failures = results.filter((r) => r.level === 'fail').length;
  const warnings = results.filter((r) => r.level === 'warn').length;
  console.log(line);

  if (failures > 0) {
    console.log(`  ${failures} thing(s) must be fixed before this will work.`);
    if (warnings) console.log(`  ${warnings} other thing(s) are worth a look.`);
    console.log(`${line}\n`);
    process.exit(1);
  }
  if (warnings > 0) {
    console.log(`  Nothing is broken. ${warnings} thing(s) are worth a look above.`);
  } else {
    console.log('  Everything checks out. Paste these into the host and deploy.');
  }
  console.log(`${line}\n`);
  process.exit(0);
}

async function main() {
  checkSecrets();
  checkAppSettings();
  await checkDatabase();
  await checkStorage();
  report();
}

main().catch((err) => {
  console.error('\nThe check itself failed:', err);
  process.exit(1);
});
