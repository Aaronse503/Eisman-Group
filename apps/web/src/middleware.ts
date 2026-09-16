import { NextResponse, type NextRequest } from 'next/server';

/**
 * Cheap edge-side gate: bounce unauthenticated page requests to /login before
 * they reach a server component. The authoritative check is still
 * `requireActor()` / `requirePermission()` in the server layer — this only
 * saves a round trip and never grants access on its own.
 */
const PUBLIC_PATHS = ['/login', '/api/health', '/api/auth'];

/** The versioned API used by the mobile application. */
const API_PREFIX = '/api/v1';

/**
 * Cross-origin rules for the API.
 *
 * The origin is echoed with no `Access-Control-Allow-Credentials`, so a
 * browser will neither send cookies to it nor expose the response of a
 * credentialed request. The mobile application authenticates with a bearer
 * token instead, which no other site can read from it.
 */
function withCors(response: NextResponse, request: NextRequest): NextResponse {
  const origin = request.headers.get('origin');
  if (origin) response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Vary', 'Origin');
  response.headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  response.headers.set('Access-Control-Max-Age', '600');
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith(API_PREFIX)) {
    if (request.method === 'OPTIONS') {
      return withCors(new NextResponse(null, { status: 204 }), request);
    }
    // Never redirect an API call to a sign-in page: a client wants a 401 it
    // can act on, not an HTML page it cannot read.
    return withCors(NextResponse.next(), request);
  }

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
