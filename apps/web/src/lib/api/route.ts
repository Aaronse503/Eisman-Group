import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';
import type { ApiError } from '@eisman/shared';
import { ForbiddenError, getActor, type Actor } from '@/lib/auth/actor';
import { AuthError } from '@/lib/auth/session';

/**
 * The shape every endpoint in /api/v1 shares.
 *
 * Authorization is not re-implemented here. A request carries the same session
 * token the browser uses, resolves to the same actor, and passes through the
 * same permission checks and the same row-level security. The mobile
 * application is a second way in, not a second set of rules.
 */

export class ApiRouteError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: ApiError['code'] = 'server_error',
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiRouteError';
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) =>
  new ApiRouteError(400, message, 'invalid_input', fields);
export const notFound = (what = 'Record') =>
  new ApiRouteError(404, `${what} not found.`, 'not_found');
export const forbidden = (message = 'You do not have permission to do that.') =>
  new ApiRouteError(403, message, 'forbidden');

function errorResponse(err: unknown): NextResponse<ApiError> {
  if (err instanceof ApiRouteError) {
    return NextResponse.json(
      { error: err.message, code: err.code, ...(err.fields ? { fields: err.fields } : {}) },
      { status: err.status },
    );
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json(
      { error: 'You do not have permission to do that.', code: 'forbidden' },
      { status: 403 },
    );
  }
  if (err instanceof AuthError) {
    return NextResponse.json(
      { error: err.message, code: err.code === 'rate_limited' ? 'rate_limited' : 'unauthenticated' },
      { status: err.code === 'rate_limited' ? 429 : 401 },
    );
  }
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      fields[key] ??= issue.message;
    }
    return NextResponse.json(
      { error: err.issues[0]?.message ?? 'Check the values you sent.', code: 'invalid_input', fields },
      { status: 400 },
    );
  }
  // Anything unexpected is logged for the server and described plainly to the
  // caller; the message itself may name internals, so it is not sent on.
  console.error('[api]', err);
  return NextResponse.json(
    { error: 'Something went wrong. Try again.', code: 'server_error' },
    { status: 500 },
  );
}

export interface RouteContext {
  request: NextRequest;
  actor: Actor;
  /** Query parameters, already parsed. */
  params: URLSearchParams;
  /** Route parameters, for a dynamic segment. */
  route: Record<string, string>;
}

type Handler<T> = (ctx: RouteContext) => Promise<T>;

/** Wraps a handler that requires a signed-in caller. */
export function authed<T>(handler: Handler<T>) {
  return async (
    request: NextRequest,
    context?: { params?: Promise<Record<string, string>> },
  ): Promise<NextResponse> => {
    try {
      const actor = await getActor();
      if (!actor) {
        return NextResponse.json(
          { error: 'Sign in to continue.', code: 'unauthenticated' } satisfies ApiError,
          { status: 401 },
        );
      }
      // A temporary password locks the rest of the system on the web, and it
      // locks the API too: otherwise the mobile app would be a way around it.
      if (actor.user.must_change_password) {
        const path = new URL(request.url).pathname;
        const allowed = path.endsWith('/auth/session') || path.endsWith('/auth/change-password');
        if (!allowed) {
          return NextResponse.json(
            {
              error: 'Set a new password before continuing.',
              code: 'must_change_password',
            } satisfies ApiError,
            { status: 403 },
          );
        }
      }

      const route = (await context?.params) ?? {};
      const data = await handler({
        request,
        actor,
        params: new URL(request.url).searchParams,
        route,
      });
      return NextResponse.json(data ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Wraps a handler that does its own authentication, such as sign-in. */
export function open<T>(handler: (request: NextRequest) => Promise<T>) {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      return NextResponse.json((await handler(request)) ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Reads and parses a JSON body, with a readable error when it is not JSON. */
export async function jsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw badRequest('Send a JSON body.');
  }
}
