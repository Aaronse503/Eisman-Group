import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticate, AuthError, SESSION_COOKIE } from '@/lib/auth/session';
import { getEnv } from '@/lib/env';
import { recordAudit } from '@/lib/audit';

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

/**
 * Programmatic sign-in, used by the end-to-end tests and the smoke script.
 * It is the same code path as the UI action, including rate limiting.
 */
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
      secure: getEnv().NODE_ENV === 'production',
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
