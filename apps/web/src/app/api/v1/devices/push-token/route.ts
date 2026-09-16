import { z } from 'zod';
import { authed, jsonBody, badRequest } from '@/lib/api/route';
import { setPushToken, registerDevice } from '@/lib/api/devices';

const schema = z.object({
  installationId: z.string().min(8).max(200),
  platform: z.enum(['ios', 'android']),
  /** Null turns notifications off for this device. */
  expoPushToken: z.string().max(400).nullable(),
});

/** Registers, updates or clears the push token for the calling device. */
export const POST = authed(async ({ request, actor }) => {
  const parsed = schema.safeParse(await jsonBody(request));
  if (!parsed.success) throw badRequest('Send an installation id and a push token.');

  // Signing in registers the device; this covers the case where permission is
  // granted later, on a device the server has not seen since.
  await registerDevice(actor.user.id, {
    installationId: parsed.data.installationId,
    platform: parsed.data.platform,
  });
  await setPushToken(actor.user.id, parsed.data.installationId, parsed.data.expoPushToken);

  return { ok: true, pushEnabled: parsed.data.expoPushToken !== null };
});
