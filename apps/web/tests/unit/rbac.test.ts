import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  accessibleCompanyIds,
  hasPermission,
  isHoldingsOwner,
  permissionsForCompany,
  rolesForCompany,
  type RoleGrant,
} from '@/lib/rbac/permissions';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

const owner: RoleGrant[] = [{ companyId: null, role: 'holdings_owner' }];
const adminOfA: RoleGrant[] = [{ companyId: A, role: 'company_admin' }];
const viewerOfA: RoleGrant[] = [{ companyId: A, role: 'viewer' }];
const contractorOfB: RoleGrant[] = [{ companyId: B, role: 'contractor' }];
const financeOfA: RoleGrant[] = [{ companyId: A, role: 'finance' }];

describe('role definitions', () => {
  it('gives the Holdings Owner every permission', () => {
    for (const permission of PERMISSIONS) {
      expect(ROLE_PERMISSIONS.holdings_owner.has(permission)).toBe(true);
    }
  });

  it('never grants a permission that is not in the catalogue', () => {
    const known = new Set<string>(PERMISSIONS);
    for (const role of ROLES) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(known.has(permission)).toBe(true);
      }
    }
  });

  it('keeps sensitive permissions away from the lower roles', () => {
    const sensitive = [
      'finance:sensitive_action',
      'team:compensation_read',
      'user:manage',
      'integration:enable_writeback',
      'demo:manage',
      'company:create',
    ] as const;
    for (const role of ['viewer', 'contractor', 'team_member'] as const) {
      for (const permission of sensitive) {
        expect(ROLE_PERMISSIONS[role].has(permission)).toBe(false);
      }
    }
  });

  it('gives a contractor only their own work', () => {
    expect([...ROLE_PERMISSIONS.contractor].sort()).toEqual(
      ['company:read', 'knowledge:read', 'task:read', 'task:write'].sort(),
    );
  });

  it('does not let a Company Admin create or archive companies', () => {
    expect(ROLE_PERMISSIONS.company_admin.has('company:create')).toBe(false);
    expect(ROLE_PERMISSIONS.company_admin.has('company:archive')).toBe(false);
  });
});

describe('hasPermission', () => {
  it('scopes a company grant to that company', () => {
    expect(hasPermission(adminOfA, 'crm:write', A)).toBe(true);
    expect(hasPermission(adminOfA, 'crm:write', B)).toBe(false);
  });

  it('applies a holdings-wide grant to every company', () => {
    expect(hasPermission(owner, 'crm:write', A)).toBe(true);
    expect(hasPermission(owner, 'crm:write', B)).toBe(true);
    // Including a company that did not exist when the grant was made.
    expect(hasPermission(owner, 'crm:write', 'fc3f0e0e-0000-0000-0000-000000000000')).toBe(true);
  });

  it('only satisfies holdings-scoped permissions from a holdings-wide grant', () => {
    expect(hasPermission(owner, 'demo:manage', null)).toBe(true);
    expect(hasPermission(adminOfA, 'demo:manage', A)).toBe(false);
    expect(hasPermission(adminOfA, 'demo:manage', null)).toBe(false);
    expect(hasPermission(adminOfA, 'company:create', null)).toBe(false);
  });

  it('allows a consolidated read when any company grant carries the permission', () => {
    expect(hasPermission(financeOfA, 'finance:read', null)).toBe(true);
    expect(hasPermission(viewerOfA, 'finance:read', null)).toBe(false);
  });

  it('refuses write permissions to a viewer', () => {
    expect(hasPermission(viewerOfA, 'crm:read', A)).toBe(true);
    expect(hasPermission(viewerOfA, 'crm:write', A)).toBe(false);
    expect(hasPermission(viewerOfA, 'finance:read', A)).toBe(false);
  });

  it('refuses everything to a user with no grants', () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission([], permission, A)).toBe(false);
      expect(hasPermission([], permission, null)).toBe(false);
    }
  });

  it('combines several grants for the same company', () => {
    const both: RoleGrant[] = [
      { companyId: A, role: 'viewer' },
      { companyId: A, role: 'finance' },
    ];
    expect(hasPermission(both, 'finance:write', A)).toBe(true);
    expect(hasPermission(both, 'user:manage', A)).toBe(false);
  });
});

describe('company visibility', () => {
  it('gives a holdings-wide grant every company', () => {
    expect(accessibleCompanyIds(owner, [A, B])).toEqual([A, B]);
  });

  it('limits a company grant to that company', () => {
    expect(accessibleCompanyIds(adminOfA, [A, B])).toEqual([A]);
    expect(accessibleCompanyIds(contractorOfB, [A, B])).toEqual([B]);
  });

  it('gives an ungranted user nothing', () => {
    expect(accessibleCompanyIds([], [A, B])).toEqual([]);
  });
});

describe('role helpers', () => {
  it('reports a holdings-wide role for every company', () => {
    expect(rolesForCompany(owner, A)).toEqual(['holdings_owner']);
    expect(rolesForCompany(owner, null)).toEqual(['holdings_owner']);
  });

  it('does not leak one company\'s role into another', () => {
    expect(rolesForCompany(adminOfA, B)).toEqual([]);
    expect(permissionsForCompany(adminOfA, B).size).toBe(0);
  });

  it('identifies a Holdings Owner only from a holdings-wide grant', () => {
    expect(isHoldingsOwner(owner)).toBe(true);
    expect(isHoldingsOwner([{ companyId: A, role: 'holdings_owner' }])).toBe(false);
  });
});
