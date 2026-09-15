import type { Permission } from '@/lib/rbac/permissions';

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  permission?: Permission;
  /** Only shown when the ParFax company is readable. */
  parfaxOnly?: boolean;
  description: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

/**
 * The single source of truth for the left navigation, the command palette and
 * the quick-create menu. Items whose permission the actor lacks are filtered
 * out rather than rendered dead — nothing in this nav is a placeholder.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Overview',
    items: [
      { href: '/', label: 'Home', icon: 'LayoutDashboard', description: 'Executive overview across the holding company' },
      { href: '/companies', label: 'Companies', icon: 'Building2', permission: 'company:read', description: 'Company workspaces, settings and creation' },
    ],
  },
  {
    label: 'Operate',
    items: [
      { href: '/crm', label: 'CRM', icon: 'Users', permission: 'crm:read', description: 'Clients, contacts, organizations and deals' },
      { href: '/tasks', label: 'Tasks', icon: 'CircleCheckBig', permission: 'task:read', description: 'Task lists, board and personal queues' },
      { href: '/calendar', label: 'Calendar', icon: 'CalendarDays', permission: 'calendar:read', description: 'Meetings, notes and follow-ups' },
      { href: '/finances', label: 'Finances', icon: 'Banknote', permission: 'finance:read', description: 'Revenue, receivables, expenses and cash flow' },
      { href: '/team', label: 'Team', icon: 'UsersRound', permission: 'team:read', description: 'People, contractors and the org chart' },
    ],
  },
  {
    label: 'Grow',
    items: [
      { href: '/partnerships', label: 'Partnerships', icon: 'Handshake', permission: 'partnership:read', description: 'Partnership pipeline and agreements' },
      { href: '/investors', label: 'Investors', icon: 'TrendingUp', permission: 'investor:read', description: 'Investor CRM and fundraising pipeline' },
      { href: '/knowledge', label: 'Knowledge Hub', icon: 'BookOpen', permission: 'knowledge:read', description: 'Documents, notes and the knowledge assistant' },
      { href: '/reports', label: 'Reports', icon: 'ChartColumn', permission: 'report:read', description: 'Configurable reporting and exports' },
    ],
  },
  {
    label: 'Administer',
    items: [
      { href: '/parfax', label: 'ParFax Admin', icon: 'Flag', permission: 'parfax:read', parfaxOnly: true, description: 'ParFax users, scans, metrics and support' },
      { href: '/integrations', label: 'Integrations', icon: 'Plug', permission: 'integration:read', description: 'Connected systems and sync status' },
      { href: '/settings', label: 'Settings', icon: 'Settings', permission: 'settings:read', description: 'Profile, members, roles, data and audit' },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);
