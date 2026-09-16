import { sql, one } from '@/lib/db/client';
import { hashPassword } from '@/lib/crypto';
import type { Role } from '@/lib/rbac/permissions';

export const DEMO_PASSWORD = 'demo1234!';
/** The operator account the seed creates, and its one-time password. */
export const OWNER_EMAIL = 'aaron@eismandigital.com';
export const OWNER_PASSWORD = 'ChangeMe123!';
export const DEMO_EMAIL_DOMAIN = 'demo.eisman.test';

export interface SeedContext {
  holdingId: string;
  companies: Record<string, string>;
  users: Record<string, string>;
}

async function upsertUser(input: {
  email: string;
  name: string;
  title: string;
  password: string;
  isDemo: boolean;
  mustChange?: boolean;
}) {
  const existing = await one<{ id: string }>(`select id from users where lower(email) = $1`, [
    input.email.toLowerCase(),
  ]);
  if (existing) return existing.id;
  const hash = await hashPassword(input.password);
  const row = await one<{ id: string }>(
    `insert into users (email, name, title, password_hash, is_demo, must_change_password)
     values ($1,$2,$3,$4,$5,$6) returning id`,
    [input.email, input.name, input.title, hash, input.isDemo, input.mustChange ?? false],
  );
  return row!.id;
}

async function grant(userId: string, companyId: string | null, role: Role) {
  await sql(
    `insert into user_company_roles (user_id, company_id, role)
     values ($1,$2,$3)
     on conflict (user_id, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), role)
     do nothing`,
    [userId, companyId, role],
  );
}

/**
 * Creates the holding company, the two initial companies and the accounts
 * needed to sign in. Idempotent: running it twice changes nothing.
 *
 * Additional companies are created through the UI, not here — nothing in the
 * codebase hard-codes the company list.
 */
export async function seedCore(opts: { ownerEmail?: string; ownerPassword?: string } = {}) {
  let holding = await one<{ id: string }>(`select id from holdings order by created_at limit 1`);
  if (!holding) {
    holding = await one<{ id: string }>(
      `insert into holdings (name, legal_name, tagline, timezone, base_currency)
       values ('Eisman Holdings', 'Eisman Holdings LLC',
               'One operating system for every company.', 'America/New_York', 'USD')
       returning id`,
    );
  }
  const holdingId = holding!.id;

  const companyDefs = [
    {
      slug: 'eisman-digital',
      name: 'Eisman Digital',
      legal_name: 'Eisman Digital LLC',
      description: 'Digital marketing and growth services agency.',
      brand_color: '#0F5132',
      accent_color: '#C8A951',
      position: 1,
    },
    {
      slug: 'parfax',
      name: 'ParFax',
      legal_name: 'ParFax Inc.',
      description: 'Golf club scanning, authentication and marketplace platform.',
      brand_color: '#14663F',
      accent_color: '#AB8A2B',
      position: 2,
    },
  ];

  const companies: Record<string, string> = {};
  for (const def of companyDefs) {
    const existing = await one<{ id: string }>(`select id from companies where slug = $1`, [
      def.slug,
    ]);
    if (existing) {
      companies[def.slug] = existing.id;
      continue;
    }
    const row = await one<{ id: string }>(
      `insert into companies
         (holding_id, slug, name, legal_name, description, brand_color, accent_color, position)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [
        holdingId,
        def.slug,
        def.name,
        def.legal_name,
        def.description,
        def.brand_color,
        def.accent_color,
        def.position,
      ],
    );
    companies[def.slug] = row!.id;
  }

  const users: Record<string, string> = {};

  // The real operator account. Its password must be changed at first sign-in.
  const ownerEmail = opts.ownerEmail ?? OWNER_EMAIL;
  users.owner = await upsertUser({
    email: ownerEmail,
    name: 'Aaron Eisman',
    title: 'Founder, Eisman Holdings',
    password: opts.ownerPassword ?? OWNER_PASSWORD,
    isDemo: false,
    mustChange: !opts.ownerPassword,
  });
  await grant(users.owner, null, 'holdings_owner');

  return { holdingId, companies, users } satisfies SeedContext;
}

/** Demo staff accounts, one per role, so every permission path is testable. */
export async function seedDemoUsers(ctx: SeedContext) {
  const defs: {
    key: string;
    email: string;
    name: string;
    title: string;
    grants: [string | null, Role][];
  }[] = [
    {
      key: 'admin',
      email: `dana.ops@${DEMO_EMAIL_DOMAIN}`,
      name: 'Dana Ortiz',
      title: 'Director of Operations',
      grants: [[ctx.companies['eisman-digital']!, 'company_admin']],
    },
    {
      key: 'finance',
      email: `marcus.finance@${DEMO_EMAIL_DOMAIN}`,
      name: 'Marcus Reed',
      title: 'Head of Finance',
      grants: [[null, 'finance']],
    },
    {
      key: 'am',
      email: `priya.am@${DEMO_EMAIL_DOMAIN}`,
      name: 'Priya Raman',
      title: 'Senior Account Manager',
      grants: [[ctx.companies['eisman-digital']!, 'account_manager']],
    },
    {
      key: 'parfax',
      email: `jordan.parfax@${DEMO_EMAIL_DOMAIN}`,
      name: 'Jordan Blake',
      title: 'ParFax General Manager',
      grants: [[ctx.companies['parfax']!, 'company_admin']],
    },
    {
      key: 'member',
      email: `noa.strategy@${DEMO_EMAIL_DOMAIN}`,
      name: 'Noa Feldman',
      title: 'Growth Strategist',
      grants: [
        [ctx.companies['eisman-digital']!, 'team_member'],
        [ctx.companies['parfax']!, 'team_member'],
      ],
    },
    {
      key: 'contractor',
      email: `sam.design@${DEMO_EMAIL_DOMAIN}`,
      name: 'Sam Okafor',
      title: 'Contract Designer',
      grants: [[ctx.companies['eisman-digital']!, 'contractor']],
    },
    {
      key: 'viewer',
      email: `val.viewer@${DEMO_EMAIL_DOMAIN}`,
      name: 'Val Chen',
      title: 'Advisor (read-only)',
      grants: [[ctx.companies['eisman-digital']!, 'viewer']],
    },
  ];

  for (const def of defs) {
    const id = await upsertUser({
      email: def.email,
      name: def.name,
      title: def.title,
      password: DEMO_PASSWORD,
      isDemo: true,
    });
    ctx.users[def.key] = id;
    for (const [companyId, role] of def.grants) await grant(id, companyId, role);
  }
  return ctx;
}

export { grant as grantRole, upsertUser };
