import { z } from 'zod';
import { authenticate } from '@/lib/auth/session';
import { actorForToken } from '@/lib/auth/actor';
import { recordAudit } from '@/lib/audit';
import { open, jsonBody, badRequest } from '@/lib/api/route';
import { sessionPayload } from '@/lib/api/session-payload';
import { registerDevice } from '@/lib/api/devices';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  device: z
    .object({
      installationId: z.string().min(8).max(200),
      platform: z.enum(['ios', 'android', 'web']),
      model: z.string().max(120).optional(),
      osVersion: z.string().max(60).optional(),
      appVersion: z.string().max(40).optional(),
    })
    .optional(),
});

/**
 * Sign-in for the mobile application.
 *
 * Returns the session token in the body rather than setting a cookie: a native
 * app keeps it in the device's secure storage. It is the same token the
 * browser uses, subject to the same expiry, revocation and rate limiting.
 */
export const POST = open(async (request) => {
  const parsed = schema.safeParse(await jsonBody(request));
  if (!parsed.success) throw badRequest('Enter an email address and password.');

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = request.headers.get('user-agent');

  const { token, expiresAt, user } = await authenticate(parsed.data.email, parsed.data.password, {
    ip,
    userAgent,
  });

  await recordAudit({
    actor: { user },
    action: 'auth.sign_in',
    entityType: 'user',
    entityId: user.id,
    entityLabel: user.email,
    reason: parsed.data.device ? `Mobile (${parsed.data.device.platform})` : 'API',
    ip,
    userAgent,
  });

  if (parsed.data.device) {
    await registerDevice(user.id, parsed.data.device);
  }

  // Built through the same path every other request uses, so the payload
  // cannot drift from what the rest of the system sees.
  const actor = await actorForToken(token);
  if (!actor) throw badRequest('Could not start a session. Try again.');
  return sessionPayload(actor, token, expiresAt);
});
