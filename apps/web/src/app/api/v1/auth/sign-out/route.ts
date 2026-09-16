import { z } from 'zod';
import { authed, jsonBody } from '@/lib/api/route';
import { revokeSession } from '@/lib/auth/session';
import { forgetDevice } from '@/lib/api/devices';
import { recordAudit } from '@/lib/audit';

const schema = z.object({ installationId: z.string().min(8).max(200).optional() });

/**
 * Ends this session, and forgets the device with it.
 *
 * Forgetting the device matters: otherwise a phone that has been signed out
 * would keep receiving notifications for an account it can no longer open.
 */
export const POST = authed(async ({ request, actor }) => {
  const parsed = schema.safeParse(await jsonBody(request).catch(() => ({})));
  await revokeSession(actor.sessionId);
  if (parsed.success && parsed.data.installationId) {
    await forgetDevice(actor.user.id, parsed.data.installationId);
  }
  await recordAudit({
    actor,
    action: 'auth.sign_out',
    entityType: 'user',
    entityId: actor.user.id,
    entityLabel: actor.user.email,
  });
  return { ok: true };
});
