import 'server-only';
import type { ApiCompany, ApiUser, SessionResponse } from '@eisman/shared';
import { permissionsForCompany, rolesForCompany } from '@eisman/shared';
import type { Actor } from '@/lib/auth/actor';
import { getEnv } from '@/lib/env';

export function toApiUser(user: Actor['user']): ApiUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    title: user.title,
    avatarUrl: user.avatar_url,
    timezone: user.timezone,
    isDemo: user.is_demo,
    mustChangePassword: user.must_change_password,
  };
}

export function toApiCompany(company: Actor['companies'][number]): ApiCompany {
  return {
    id: company.id,
    slug: company.slug,
    name: company.name,
    status: company.status,
    brandColor: company.brand_color,
    accentColor: company.accent_color,
    currency: company.currency,
    isDemo: company.is_demo,
  };
}

/**
 * Everything the mobile application needs to render correctly for this person:
 * who they are, which companies they can see, and what they may do. The
 * permission list is sent so the interface can hide what it should; the server
 * still checks every request regardless of what the device believes.
 */
export function sessionPayload(
  actor: Actor,
  token: string,
  expiresAt: Date,
): SessionResponse {
  return {
    token,
    expiresAt: expiresAt.toISOString(),
    user: toApiUser(actor.user),
    companies: actor.companies.map(toApiCompany),
    grants: actor.grants,
    roles: rolesForCompany(actor.grants, null),
    permissions: [...permissionsForCompany(actor.grants, null)],
    demoMode: getEnv().DEMO_MODE,
  };
}
