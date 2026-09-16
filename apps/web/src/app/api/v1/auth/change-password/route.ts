import { authed, jsonBody, badRequest } from '@/lib/api/route';
import { changePasswordAction } from '@/server/actions/auth';

/**
 * Changes the caller's password.
 *
 * This is the one endpoint reachable while an account is still on a temporary
 * password, because it is the way out of that state. It delegates to the same
 * action the web application uses, so the rules — current password required,
 * strength, other sessions revoked — are identical.
 */
export const POST = authed(async ({ request }) => {
  const result = await changePasswordAction(await jsonBody(request));
  if (!result.ok) throw badRequest(result.error);
  return { ok: true };
});
