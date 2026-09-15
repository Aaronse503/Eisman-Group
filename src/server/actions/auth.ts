'use server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { authenticate, AuthError, SESSION_COOKIE, setPassword } from '@/lib/auth/session';
import { requestInfo, requireActor } from '@/lib/auth/actor';
import { recordAudit } from '@/lib/audit';
import { getEnv } from '@/lib/env';
import { verifyPassword } from '@/lib/crypto';
import { one } from '@/lib/db/client';
import { revokeAllSessionsForUser } from '@/lib/auth/session';

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function signInAction(input: z.infer<typeof signInSchema>) {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: 'Enter a valid email and password.' };

  const info = await requestInfo();
  try {
    const { token, expiresAt, user } = await authenticate(
      parsed.data.email,
      parsed.data.password,
      info,
    );
    (await cookies()).set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: getEnv().NODE_ENV === 'production',
      path: '/',
      expires: expiresAt,
    });
    await recordAudit({
      actor: { user },
      action: 'auth.sign_in',
      entityType: 'user',
      entityId: user.id,
      entityLabel: user.email,
      ip: info.ip,
      userAgent: info.userAgent,
    });
    return { ok: true as const };
  } catch (err) {
    if (err instanceof AuthError) {
      await recordAudit({
        actor: null,
        action: 'auth.sign_in_failed',
        entityType: 'user',
        entityLabel: parsed.data.email,
        reason: err.code,
        severity: 'warning',
        ip: info.ip,
        userAgent: info.userAgent,
      });
      return { ok: false as const, error: err.message };
    }
    throw err;
  }
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z
      .string()
      .min(12, 'Use at least 12 characters')
      .regex(/[a-z]/, 'Include a lowercase letter')
      .regex(/[A-Z]/, 'Include an uppercase letter')
      .regex(/[0-9]/, 'Include a number'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export async function changePasswordAction(input: unknown) {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }
  const actor = await requireActor();
  const row = await one<{ password_hash: string | null }>(
    `select password_hash from users where id = $1`,
    [actor.user.id],
  );
  if (!(await verifyPassword(parsed.data.currentPassword, row?.password_hash ?? null))) {
    return { ok: false as const, error: 'Your current password is incorrect.' };
  }
  await setPassword(actor.user.id, parsed.data.newPassword);
  // Changing a password invalidates every other session for that user.
  await revokeAllSessionsForUser(actor.user.id, actor.sessionId);
  await recordAudit({
    actor,
    action: 'auth.password_changed',
    entityType: 'user',
    entityId: actor.user.id,
    entityLabel: actor.user.email,
    severity: 'notice',
  });
  return { ok: true as const };
}

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120),
  title: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(60).optional(),
  timezone: z.string().trim().min(1).max(60),
});

export async function updateProfileAction(input: unknown) {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }
  const actor = await requireActor();
  const { one: queryOne } = await import('@/lib/db/client');
  await queryOne(
    `update users set name = $2, title = $3, phone = $4, timezone = $5 where id = $1 returning id`,
    [
      actor.user.id,
      parsed.data.name,
      parsed.data.title || null,
      parsed.data.phone || null,
      parsed.data.timezone,
    ],
  );
  await recordAudit({
    actor,
    action: 'user.profile_updated',
    entityType: 'user',
    entityId: actor.user.id,
    entityLabel: actor.user.email,
  });
  return { ok: true as const };
}

export async function revokeSessionAction(sessionId: string) {
  const actor = await requireActor();
  const { one: queryOne } = await import('@/lib/db/client');
  const session = await queryOne<{ user_id: string }>(
    `select user_id from sessions where id = $1`,
    [sessionId],
  );
  if (!session) return { ok: false as const, error: 'Session not found.' };
  if (session.user_id !== actor.user.id && !actor.can('user:manage')) {
    return { ok: false as const, error: 'You can only revoke your own sessions.' };
  }
  const { revokeSession } = await import('@/lib/auth/session');
  await revokeSession(sessionId);
  await recordAudit({
    actor,
    action: 'auth.session_revoked',
    entityType: 'session',
    entityId: sessionId,
    severity: 'notice',
  });
  return { ok: true as const };
}

export async function revokeOtherSessionsAction() {
  const actor = await requireActor();
  await revokeAllSessionsForUser(actor.user.id, actor.sessionId);
  await recordAudit({
    actor,
    action: 'auth.all_sessions_revoked',
    entityType: 'user',
    entityId: actor.user.id,
    entityLabel: actor.user.email,
    severity: 'notice',
  });
  return { ok: true as const };
}
