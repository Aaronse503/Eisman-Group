'use server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db/client';
import { getActor, requireActor } from '@/lib/auth/actor';
import { revokeSession, SESSION_COOKIE } from '@/lib/auth/session';
import { SCOPE_COOKIE, HOLDINGS_SCOPE } from '@/lib/scope';
import { recordAudit } from '@/lib/audit';

export async function setScopeAction(slug: string) {
  const actor = await requireActor();
  const valid =
    slug === HOLDINGS_SCOPE || actor.companies.some((c) => c.slug === slug && !c.archived_at);
  if (!valid) return { ok: false as const, error: 'You do not have access to that workspace.' };

  (await cookies()).set(SCOPE_COOKIE, slug, {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath('/', 'layout');
  return { ok: true as const };
}

export async function signOutAction() {
  const actor = await getActor();
  if (actor) {
    await revokeSession(actor.sessionId);
    await recordAudit({
      actor,
      action: 'auth.sign_out',
      entityType: 'session',
      entityId: actor.sessionId,
    });
  }
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}

export async function markNotificationsReadAction(ids?: string[]) {
  const actor = await requireActor();
  if (ids?.length) {
    await sql(
      `update notifications set read_at = now()
       where user_id = $1 and id = any($2) and read_at is null`,
      [actor.user.id, ids],
    );
  } else {
    await sql(`update notifications set read_at = now() where user_id = $1 and read_at is null`, [
      actor.user.id,
    ]);
  }
  revalidatePath('/', 'layout');
  return { ok: true as const };
}

export async function recordRecentlyViewedAction(input: {
  entityType: string;
  entityId: string;
  label: string;
  href: string;
  companyId?: string | null;
}) {
  const actor = await getActor();
  if (!actor) return { ok: false as const };
  await sql(
    `insert into recently_viewed (user_id, company_id, entity_type, entity_id, label, href)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (user_id, entity_type, entity_id)
     do update set viewed_at = now(), label = excluded.label, href = excluded.href`,
    [actor.user.id, input.companyId ?? null, input.entityType, input.entityId, input.label, input.href],
  );
  // Keep the list to the most recent 30 entries per user.
  await sql(
    `delete from recently_viewed where user_id = $1 and id not in (
       select id from recently_viewed where user_id = $1 order by viewed_at desc limit 30)`,
    [actor.user.id],
  );
  return { ok: true as const };
}
