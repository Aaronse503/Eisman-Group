/**
 * Tests run against their own embedded Postgres so they never touch the
 * development database (PGlite allows one process per data directory, and a
 * running dev server holds `.data/pglite`).
 */
process.env.PGLITE_DATA_DIR ??= '.data/test-pglite';
process.env.AUTH_SECRET ??= 'test-only-secret-key-at-least-32-characters-long';
process.env.ENCRYPTION_KEY ??= 'ZWlzbWFuLWNvbW1hbmQtY2VudGVyLXRlc3Qta2V5MzI=';
process.env.DEMO_MODE ??= 'true';
// NODE_ENV is typed read-only by Next's ambient types; assign through the bag.
(process.env as Record<string, string | undefined>).NODE_ENV ??= 'test';
