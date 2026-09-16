import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticate, AuthError, SESSION_COOKIE } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit';

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

/**
 * Sign-in. The browser form posts here, as do the end-to-end tests and the
 * smoke script, so there is one code path including the rate limiting.
 */

/**
 * Whether the session cookie should be marked Secure.
 *
 * Taken from the protocol the request actually arrived on — via
 * x-forwarded-proto when a proxy terminated TLS — rather than from NODE_ENV.
 * A production deployment is served over HTTPS and gets a Secure cookie; a
 * production build served over plain HTTP locally still works, instead of
 * silently handing out a cookie the browser will refuse to keep.
 */
export function isSecureRequest(request: NextRequest): boolean {
  const forwarded = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  if (forwarded) return forwarded === 'https';
  return request.nextUrl.protocol === 'https:';
}
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = request.headers.get('user-agent');

  try {
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
      ip,
      userAgent,
    });
    const response = NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email, name: user.name },
    });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isSecureRequest(request),
      path: '/',
      expires: expiresAt,
    });
    return response;
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.code === 'rate_limited' ? 429 : 401 },
      );
    }
    throw err;
  }
}
