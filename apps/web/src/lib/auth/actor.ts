import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, resolveSession, type ResolvedSession } from './session';
import {
  accessibleCompanyIds,
  hasPermission,
  isHoldingsOwner,
  permissionsForCompany,
  rolesForCompany,
  type Permission,
  type Role,
  type RoleGrant,
} from '@/lib/rbac/permissions';
import { sql } from '@/lib/db/client';

export interface CompanySummary {
  id: string;
  slug: string;
  name: string;
  status: string;
  brand_color: string;
  accent_color: string;
  currency: string;
  timezone: string;
  is_demo: boolean;
  position: number;
  archived_at: Date | null;
}

export interface Actor {
  sessionId: string;
  /** When this session stops being valid, as stored on the session itself. */
  sessionExpiresAt: Date;
  user: ResolvedSession['user'];
  grants: RoleGrant[];
  /** Every non-archived company this actor may read, in display order. */
  companies: CompanySummary[];
  isHoldingsOwner: boolean;
  can(permission: Permission, companyId?: string | null): boolean;
  rolesFor(companyId: string | null): Role[];
  permissionsFor(companyId: string | null): Set<Permission>;
  canReadCompany(companyId: string): boolean;
}

function buildActor(session: ResolvedSession, companies: CompanySummary[]): Actor {
  const accessible = new Set(
    accessibleCompanyIds(
      session.grants,
      companies.map((c) => c.id),
    ),
  );
  const visible = companies.filter((c) => accessible.has(c.id));
  return {
    sessionId: session.sessionId,
    sessionExpiresAt: session.expiresAt,
    user: session.user,
    grants: session.grants,
    companies: visible,
    isHoldingsOwner: isHoldingsOwner(session.grants),
    can: (permission, companyId = null) => hasPermission(session.grants, permission, companyId),
    rolesFor: (companyId) => rolesForCompany(session.grants, companyId),
    permissionsFor: (companyId) => permissionsForCompany(session.grants, companyId),
    canReadCompany: (companyId) => accessible.has(companyId),
  };
}

/**
 * The session token for this request.
 *
 * The browser sends a cookie; the mobile application sends a bearer token,
 * because a native app has no cookie jar worth relying on. Both are the same
 * opaque session token, so everything downstream — permissions, row-level
 * security, the audit trail — behaves identically whichever arrived.
 */
async function requestToken(): Promise<string | undefined> {
  const jar = await cookies();
  const fromCookie = jar.get(SESSION_COOKIE)?.value;
  if (fromCookie) return fromCookie;

  const authorization = (await headers()).get('authorization');
  if (!authorization) return undefined;
  const [scheme, value] = authorization.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value.trim() : undefined;
}

/**
 * Resolves an actor from a session token directly.
 *
 * Sign-in needs this: the token it just issued is not on the request it is
 * answering, so there is nothing for `getActor()` to read.
 */
export async function actorForToken(token: string): Promise<Actor | null> {
  const session = await resolveSession(token);
  if (!session) return null;
  const companies = await sql<CompanySummary>(
    `select id, slug, name, status, brand_color, accent_color, currency, timezone,
            is_demo, position, archived_at
     from companies
     order by position, name`,
  );
  return buildActor(session, companies);
}

/** Resolves the signed-in actor for this request. Cached per request. */
export const getActor = cache(async (): Promise<Actor | null> => {
  const token = await requestToken();
  return token ? actorForToken(token) : null;
});

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect('/login');
  return actor;
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(
    readonly permission: Permission,
    readonly companyId: string | null,
  ) {
    super(`Missing permission "${permission}"${companyId ? ` for company ${companyId}` : ''}.`);
    this.name = 'ForbiddenError';
  }
}

/** Throws unless the current actor holds `permission` for `companyId`. */
export async function requirePermission(
  permission: Permission,
  companyId: string | null = null,
): Promise<Actor> {
  const actor = await requireActor();
  if (companyId && !actor.canReadCompany(companyId)) {
    throw new ForbiddenError(permission, companyId);
  }
  if (!actor.can(permission, companyId)) {
    throw new ForbiddenError(permission, companyId);
  }
  return actor;
}

export async function requireCompanyAccess(companyId: string): Promise<Actor> {
  const actor = await requireActor();
  if (!actor.canReadCompany(companyId)) {
    throw new ForbiddenError('company:read', companyId);
  }
  return actor;
}

export async function requestInfo() {
  const h = await headers();
  return {
    ip:
      h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      h.get('x-real-ip') ??
      null,
    userAgent: h.get('user-agent'),
  };
}
