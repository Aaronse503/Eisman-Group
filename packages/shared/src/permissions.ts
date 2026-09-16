/**
 * Role-based access control.
 *
 * Roles are granted per company. A grant with a null company_id is
 * holdings-wide and applies to every company, present and future.
 * Permission checks are always evaluated against a specific company except
 * for the handful of holdings-level permissions listed in HOLDINGS_SCOPED.
 */

export const ROLES = [
  'holdings_owner',
  'company_admin',
  'finance',
  'account_manager',
  'team_member',
  'contractor',
  'viewer',
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  holdings_owner: 'Holdings Owner',
  company_admin: 'Company Admin',
  finance: 'Finance',
  account_manager: 'Account Manager',
  team_member: 'Team Member',
  contractor: 'Contractor',
  viewer: 'Viewer',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  holdings_owner: 'Full access to every company, finances, people and settings.',
  company_admin: 'Full access within their company, including integrations and members.',
  finance: 'Financial records, invoices, payroll totals and financial reports.',
  account_manager: 'Clients, contacts, deals, tasks, meetings and documents for their company.',
  team_member: 'Day-to-day operations: tasks, notes, meetings and non-sensitive records.',
  contractor: 'Only their own assigned work, plus the documents attached to it.',
  viewer: 'Read-only access to the non-sensitive records of their company.',
};

export const PERMISSIONS = [
  'company:read',
  'company:write',
  'company:create',
  'company:archive',
  'crm:read',
  'crm:write',
  'task:read',
  'task:write',
  'task:assign',
  'calendar:read',
  'calendar:write',
  'finance:read',
  'finance:write',
  'finance:sensitive_action',
  'team:read',
  'team:write',
  'team:compensation_read',
  'partnership:read',
  'partnership:write',
  'investor:read',
  'investor:write',
  'knowledge:read',
  'knowledge:write',
  'knowledge:restricted_read',
  'report:read',
  'parfax:read',
  'parfax:user_admin',
  'parfax:metrics_admin',
  'integration:read',
  'integration:write',
  'integration:enable_writeback',
  'settings:read',
  'settings:write',
  'user:manage',
  'audit:read',
  'import:run',
  'export:run',
  'demo:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Permissions that only make sense at the holding level. */
export const HOLDINGS_SCOPED: ReadonlySet<Permission> = new Set<Permission>([
  'company:create',
  'demo:manage',
]);

const VIEWER: Permission[] = [
  'company:read',
  'crm:read',
  'task:read',
  'calendar:read',
  'team:read',
  'partnership:read',
  'knowledge:read',
  'report:read',
  'parfax:read',
  'integration:read',
  'settings:read',
  'export:run',
];

const CONTRACTOR: Permission[] = ['company:read', 'task:read', 'task:write', 'knowledge:read'];

const TEAM_MEMBER: Permission[] = [
  ...VIEWER,
  'crm:write',
  'task:write',
  'task:assign',
  'calendar:write',
  'knowledge:write',
  'import:run',
];

const ACCOUNT_MANAGER: Permission[] = [
  ...TEAM_MEMBER,
  'partnership:write',
  'investor:read',
  'investor:write',
  'finance:read',
];

const FINANCE: Permission[] = [
  ...VIEWER,
  'finance:read',
  'finance:write',
  'finance:sensitive_action',
  'team:compensation_read',
  'import:run',
  'audit:read',
  'investor:read',
];

const COMPANY_ADMIN: Permission[] = [
  ...ACCOUNT_MANAGER,
  ...FINANCE,
  'company:write',
  'team:write',
  'knowledge:restricted_read',
  'parfax:user_admin',
  'parfax:metrics_admin',
  'integration:write',
  'settings:write',
  'user:manage',
  'audit:read',
];

const HOLDINGS_OWNER: Permission[] = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  holdings_owner: new Set(HOLDINGS_OWNER),
  company_admin: new Set(COMPANY_ADMIN),
  finance: new Set(FINANCE),
  account_manager: new Set(ACCOUNT_MANAGER),
  team_member: new Set(TEAM_MEMBER),
  contractor: new Set(CONTRACTOR),
  viewer: new Set(VIEWER),
};

export interface RoleGrant {
  /** null = the grant applies across the whole holding company. */
  companyId: string | null;
  role: Role;
}

/** Every role the user holds for a given company, including holdings-wide grants. */
export function rolesForCompany(grants: readonly RoleGrant[], companyId: string | null): Role[] {
  const out = new Set<Role>();
  for (const g of grants) {
    if (g.companyId === null || (companyId !== null && g.companyId === companyId)) {
      out.add(g.role);
    }
  }
  return [...out];
}

export function permissionsForCompany(
  grants: readonly RoleGrant[],
  companyId: string | null,
): Set<Permission> {
  const out = new Set<Permission>();
  for (const role of rolesForCompany(grants, companyId)) {
    for (const p of ROLE_PERMISSIONS[role]) out.add(p);
  }
  return out;
}

/**
 * The core check. `companyId` is required for company-scoped permissions;
 * passing null only satisfies holdings-scoped permissions, or any permission
 * for a user holding a holdings-wide grant.
 */
export function hasPermission(
  grants: readonly RoleGrant[],
  permission: Permission,
  companyId: string | null,
): boolean {
  if (HOLDINGS_SCOPED.has(permission)) {
    // Only a holdings-wide grant can satisfy these.
    return grants.some(
      (g) => g.companyId === null && ROLE_PERMISSIONS[g.role].has(permission),
    );
  }
  if (companyId === null) {
    // "Across the holding company" view: any company grant that carries the
    // permission is enough to see the consolidated version of that data.
    return grants.some((g) => ROLE_PERMISSIONS[g.role].has(permission));
  }
  return permissionsForCompany(grants, companyId).has(permission);
}

/** Company ids the user can read; `null` companyId means all companies. */
export function accessibleCompanyIds(
  grants: readonly RoleGrant[],
  allCompanyIds: readonly string[],
): string[] {
  if (grants.some((g) => g.companyId === null)) return [...allCompanyIds];
  const ids = new Set<string>();
  for (const g of grants) if (g.companyId) ids.add(g.companyId);
  return allCompanyIds.filter((id) => ids.has(id));
}

export function isHoldingsOwner(grants: readonly RoleGrant[]): boolean {
  return grants.some((g) => g.companyId === null && g.role === 'holdings_owner');
}
