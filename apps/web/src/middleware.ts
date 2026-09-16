import { NextResponse, type NextRequest } from 'next/server';

/**
 * Cheap edge-side gate: bounce unauthenticated requests to /login before they
 * reach a server component. The authoritative check is still
 * `requireActor()` / `requirePermission()` in the server layer — this only
 * saves a round trip and never grants access on its own.
 */
const PUBLIC_PATHS = ['/login', '/api/health', '/api/auth'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  if (!request.cookies.get('ehcc_session')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
