import { sql, asService } from '@/lib/db/client';
import { ensureMigrated } from '@/lib/db/migrate';
import { generateToken, hashPassword, hashToken, verifyPassword } from '@/lib/crypto';
import { getEnv } from '@/lib/env';
import type { Role, RoleGrant } from '@/lib/rbac/permissions';

export const SESSION_COOKIE = 'ehcc_session';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  title: string | null;
  avatar_url: string | null;
  timezone: string;
  status: string;
  is_demo: boolean;
  must_change_password: boolean;
}

export interface ResolvedSession {
  sessionId: string;
  user: SessionUser;
  grants: RoleGrant[];
  expiresAt: Date;
}

interface RequestInfo {
  ip?: string | null;
  userAgent?: string | null;
}

export async function createSession(userId: string, info: RequestInfo = {}) {
  const env = getEnv();
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 3600_000);
  await sql(
    `insert into sessions (user_id, token_hash, expires_at, ip, user_agent)
     values ($1, $2, $3, $4, $5)`,
    [userId, hashToken(token), expiresAt, info.ip ?? null, info.userAgent?.slice(0, 500) ?? null],
  );
  await sql(`update users set last_login_at = now() where id = $1`, [userId]);
  return { token, expiresAt };
}

export async function resolveSession(token: string | undefined): Promise<ResolvedSession | null> {
  if (!token) return null;
  await ensureMigrated();
  const rows = await sql<{
    session_id: string;
    expires_at: Date;
    id: string;
    email: string;
    name: string;
    title: string | null;
    avatar_url: string | null;
    timezone: string;
    status: string;
    is_demo: boolean;
    must_change_password: boolean;
  }>(
    `select s.id as session_id, s.expires_at,
            u.id, u.email, u.name, u.title, u.avatar_url, u.timezone,
            u.status, u.is_demo, u.must_change_password
     from sessions s
     join users u on u.id = s.user_id
     where s.token_hash = $1
       and s.revoked_at is null
       and s.expires_at > now()
       and u.status = 'active'`,
    [hashToken(token)],
  );
  const row = rows[0];
  if (!row) return null;

  const grantRows = await sql<{ company_id: string | null; role: Role }>(
    `select company_id, role from user_company_roles where user_id = $1`,
    [row.id],
  );

  // Touch last_seen_at at most once a minute to avoid a write per request.
  void sql(
    `update sessions set last_seen_at = now()
     where id = $1 and last_seen_at < now() - interval '1 minute'`,
    [row.session_id],
  ).catch(() => undefined);

  return {
    sessionId: row.session_id,
    expiresAt: row.expires_at,
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      title: row.title,
      avatar_url: row.avatar_url,
      timezone: row.timezone,
      status: row.status,
      is_demo: row.is_demo,
      must_change_password: row.must_change_password,
    },
    grants: grantRows.map((g) => ({ companyId: g.company_id, role: g.role })),
  };
}

export async function revokeSession(sessionId: string) {
  await sql(`update sessions set revoked_at = now() where id = $1`, [sessionId]);
}

export async function revokeAllSessionsForUser(userId: string, exceptSessionId?: string) {
  await sql(
    `update sessions set revoked_at = now()
     where user_id = $1 and revoked_at is null and ($2::uuid is null or id <> $2::uuid)`,
    [userId, exceptSessionId ?? null],
  );
}

export async function listSessionsForUser(userId: string) {
  return sql<{
    id: string;
    issued_at: Date;
    last_seen_at: Date;
    expires_at: Date;
    ip: string | null;
    user_agent: string | null;
  }>(
    `select id, issued_at, last_seen_at, expires_at, ip, user_agent
     from sessions
     where user_id = $1 and revoked_at is null and expires_at > now()
     order by last_seen_at desc`,
    [userId],
  );
}

export async function purgeExpiredSessions() {
  const rows = await sql<{ count: number }>(
    `with deleted as (
       delete from sessions
       where expires_at < now() - interval '7 days' returning 1
     ) select count(*)::int as count from deleted`,
  );
  return rows[0]?.count ?? 0;
}

// --------------------------------------------------------------- credentials

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid_credentials' | 'rate_limited' | 'inactive',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Fixed-window counter in the database, so the limit holds across serverless
 * instances. Returns false when the caller is over budget.
 */
export async function consumeRateLimit(bucket: string, limit: number, windowSeconds: number) {
  const rows = await asService(async (db) => {
    return db.query<{ count: number }>(
      `insert into rate_limits (bucket, window_start, count)
       values ($1, now(), 1)
       on conflict (bucket) do update set
         count = case
           when rate_limits.window_start < now() - make_interval(secs => $2::double precision)
           then 1 else rate_limits.count + 1 end,
         window_start = case
           when rate_limits.window_start < now() - make_interval(secs => $2::double precision)
           then now() else rate_limits.window_start end
       returning count`,
      [bucket, windowSeconds],
    );
  });
  return (rows[0]?.count ?? 0) <= limit;
}

export async function authenticate(
  email: string,
  password: string,
  info: RequestInfo = {},
): Promise<{ token: string; expiresAt: Date; user: SessionUser }> {
  await ensureMigrated();
  const normalized = email.trim().toLowerCase();

  const env = getEnv();
  const ipOk = await consumeRateLimit(`login:ip:${info.ip ?? 'unknown'}`, env.LOGIN_ATTEMPTS_PER_IP, 900);
  const emailOk = await consumeRateLimit(`login:email:${normalized}`, env.LOGIN_ATTEMPTS_PER_EMAIL, 900);
  if (!ipOk || !emailOk) {
    throw new AuthError('Too many sign-in attempts. Try again in a few minutes.', 'rate_limited');
  }

  const rows = await sql<SessionUser & { password_hash: string | null }>(
    `select id, email, name, title, avatar_url, timezone, status, is_demo,
            must_change_password, password_hash
     from users where lower(email) = $1`,
    [normalized],
  );
  const user = rows[0];

  // Always run a verification so a missing account and a wrong password take
  // comparable time.
  const ok = await verifyPassword(password, user?.password_hash ?? null);
  if (!user || !ok) {
    throw new AuthError('Email or password is incorrect.', 'invalid_credentials');
  }
  if (user.status !== 'active') {
    throw new AuthError('This account is not active. Contact an administrator.', 'inactive');
  }

  const { token, expiresAt } = await createSession(user.id, info);
  const { password_hash: _ignored, ...safeUser } = user;
  return { token, expiresAt, user: safeUser };
}

export async function setPassword(userId: string, password: string) {
  const hash = await hashPassword(password);
  await sql(
    `update users set password_hash = $2, password_algo = 'scrypt',
       must_change_password = false where id = $1`,
    [userId, hash],
  );
}
