import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { freshDatabase } from '../db';
import { one, sql } from '@/lib/db/client';
import {
  AuthError,
  authenticate,
  consumeRateLimit,
  listSessionsForUser,
  purgeExpiredSessions,
  resolveSession,
  revokeAllSessionsForUser,
  revokeSession,
  setPassword,
} from '@/lib/auth/session';
import { hashToken } from '@/lib/crypto';

/** Runs a sign-in that is expected to fail and returns the AuthError. */
async function signInFailure(email: string, password: string, ip: string): Promise<AuthError> {
  try {
    await authenticate(email, password, { ip });
  } catch (err) {
    if (err instanceof AuthError) return err;
    throw err;
  }
  throw new Error(`Expected sign-in to fail for ${email}`);
}
import { seedAll } from '@/lib/seed';

const OWNER = 'aaron@eismandigital.com';
const OWNER_PASSWORD = 'ChangeMe123!';

beforeAll(async () => {
  await freshDatabase();
  await seedAll({ demo: true, ownerPassword: OWNER_PASSWORD });
}, 300_000);

// The sign-in limiter is deliberately strict (eight attempts per email per
// fifteen minutes), so clear the counters between tests. Each test that cares
// about the limiter exercises it within its own body.
beforeEach(async () => {
  await sql(`delete from rate_limits where bucket like 'login:%'`);
});

describe('authenticate', () => {
  it('signs in with the right password', async () => {
    const result = await authenticate(OWNER, OWNER_PASSWORD, { ip: '10.0.0.1' });
    expect(result.user.email).toBe(OWNER);
    expect(result.token).toBeTruthy();
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('never returns the password hash to the caller', async () => {
    const result = await authenticate(OWNER, OWNER_PASSWORD, { ip: '10.0.0.2' });
    expect(result.user).not.toHaveProperty('password_hash');
    expect(JSON.stringify(result.user)).not.toContain('scrypt$');
  });

  it('is case-insensitive about the email but not the password', async () => {
    await expect(authenticate(OWNER.toUpperCase(), OWNER_PASSWORD, { ip: '10.0.0.3' })).resolves.toBeTruthy();
    await expect(authenticate(OWNER, OWNER_PASSWORD.toLowerCase(), { ip: '10.0.0.4' })).rejects.toThrow(AuthError);
  });

  it('gives the same message for an unknown account as for a wrong password', async () => {
    const wrong = await signInFailure(OWNER, 'nope', '10.0.0.5');
    const missing = await signInFailure('nobody@example.com', 'nope', '10.0.0.6');
    expect(wrong.code).toBe('invalid_credentials');
    expect(missing.code).toBe('invalid_credentials');
    expect(missing.message).toBe(wrong.message);
  });

  it('refuses a deactivated account', async () => {
    const user = await one<{ id: string; email: string }>(`select id, email from users where email like 'val.viewer@%'`);
    await sql(`update users set status = 'deactivated' where id = $1`, [user!.id]);
    const err = await signInFailure(user!.email, 'demo1234!', '10.0.0.7');
    expect(err.code).toBe('inactive');
    await sql(`update users set status = 'active' where id = $1`, [user!.id]);
  });

  it('stores only the hash of the session token', async () => {
    const { token } = await authenticate(OWNER, OWNER_PASSWORD, { ip: '10.0.0.8' });
    const stored = await one<{ token_hash: string }>(
      `select token_hash from sessions where token_hash = $1`,
      [hashToken(token)],
    );
    expect(stored).toBeTruthy();
    const raw = await sql(`select 1 from sessions where token_hash = $1`, [token]);
    expect(raw).toHaveLength(0);
  });
});

describe('rate limiting', () => {
  it('stops a caller once it is over budget, and counts per bucket', async () => {
    const bucket = `test:${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(await consumeRateLimit(bucket, 3, 900)).toBe(true);
    expect(await consumeRateLimit(bucket, 3, 900)).toBe(false);
    expect(await consumeRateLimit(`${bucket}:other`, 3, 900)).toBe(true);
  });

  it('starts a new window once the old one has passed', async () => {
    const bucket = `test-window:${Math.random()}`;
    expect(await consumeRateLimit(bucket, 1, 900)).toBe(true);
    expect(await consumeRateLimit(bucket, 1, 900)).toBe(false);
    await sql(`update rate_limits set window_start = now() - interval '1 hour' where bucket = $1`, [bucket]);
    expect(await consumeRateLimit(bucket, 1, 900)).toBe(true);
  });

  it('locks an email out after repeated failures', async () => {
    const email = 'lockout-test@example.com';
    let lastCode = '';
    for (let i = 0; i < 12; i++) {
      lastCode = (await signInFailure(email, 'wrong', `10.9.9.${i}`)).code;
    }
    expect(lastCode).toBe('rate_limited');
  });
});

describe('sessions', () => {
  it('resolves a valid token to the user and their role grants', async () => {
    const { token } = await authenticate(OWNER, OWNER_PASSWORD, { ip: '10.0.1.1' });
    const session = await resolveSession(token);
    expect(session?.user.email).toBe(OWNER);
    expect(session?.grants.some((g) => g.companyId === null && g.role === 'holdings_owner')).toBe(true);
  });

  it('rejects a missing, unknown or tampered token', async () => {
    expect(await resolveSession(undefined)).toBe(null);
    expect(await resolveSession('')).toBe(null);
    expect(await resolveSession('not-a-real-token')).toBe(null);
    const { token } = await authenticate(OWNER, OWNER_PASSWORD, { ip: '10.0.1.2' });
    expect(await resolveSession(`${token}x`)).toBe(null);
  });

  it('rejects an expired session immediately, and purges it after the retention window', async () => {
    const { token } = await authenticate(OWNER, OWNER_PASSWORD, { ip: '10.0.1.3' });
    await sql(`update sessions set expires_at = now() - interval '1 day' where token_hash = $1`, [hashToken(token)]);
    expect(await resolveSession(token)).toBe(null);

    // Recently expired sessions are kept so they still show in the session
    // list; only rows older than the retention window are removed.
    await purgeExpiredSessions();
    expect(await sql(`select 1 from sessions where token_hash = $1`, [hashToken(token)])).toHaveLength(1);

    await sql(`update sessions set expires_at = now() - interval '8 days' where token_hash = $1`, [hashToken(token)]);
    await purgeExpiredSessions();
    expect(await sql(`select 1 from sessions where token_hash = $1`, [hashToken(token)])).toHaveLength(0);
  });

  it('revokes one session without touching the others', async () => {
    const a = await authenticate(OWNER, OWNER_PASSWORD, { ip: '10.0.1.4' });
    const b = await authenticate(OWNER, OWNER_PASSWORD, { ip: '10.0.1.5' });
    const sessionA = await resolveSession(a.token);
    await revokeSession(sessionA!.sessionId);
    expect(await resolveSession(a.token)).toBe(null);
    expect(await resolveSession(b.token)).not.toBe(null);
  });

  it('can revoke every other session, keeping the current one', async () => {
    const keep = await authenticate(OWNER, OWNER_PASSWORD, { ip: '10.0.1.6' });
    const drop = await authenticate(OWNER, OWNER_PASSWORD, { ip: '10.0.1.7' });
    const keepSession = await resolveSession(keep.token);
    const user = await one<{ id: string }>(`select id from users where email = $1`, [OWNER]);
    await revokeAllSessionsForUser(user!.id, keepSession!.sessionId);
    expect(await resolveSession(keep.token)).not.toBe(null);
    expect(await resolveSession(drop.token)).toBe(null);
  });

  it('lists a user\'s sessions without exposing the token', async () => {
    const { token } = await authenticate(OWNER, OWNER_PASSWORD, { ip: '10.0.1.8' });
    const user = await one<{ id: string }>(`select id from users where email = $1`, [OWNER]);
    const list = await listSessionsForUser(user!.id);
    expect(list.length).toBeGreaterThan(0);
    expect(JSON.stringify(list)).not.toContain(token);
  });
});

describe('password changes', () => {
  it('clears the must-change flag and invalidates the old password', async () => {
    const email = 'password-change@example.com';
    const created = await one<{ id: string }>(
      `insert into users (email, name, password_hash, status, must_change_password)
       values ($1, 'Password Tester', null, 'active', true) returning id`,
      [email],
    );
    await setPassword(created!.id, 'FirstPassword1!');
    await expect(authenticate(email, 'FirstPassword1!', { ip: '10.0.2.1' })).resolves.toBeTruthy();

    await setPassword(created!.id, 'SecondPassword1!');
    await expect(authenticate(email, 'FirstPassword1!', { ip: '10.0.2.2' })).rejects.toThrow(AuthError);
    const after = await authenticate(email, 'SecondPassword1!', { ip: '10.0.2.3' });
    expect(after.user.must_change_password).toBe(false);
  });
});
