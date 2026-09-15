import type { Permission } from '@/lib/rbac/permissions';

export interface ReportDefinition {
  id: string;
  name: string;
  description: string;
  permission: Permission;
  /** Only relevant when this company is in scope. */
  requiresCompanySlug?: string;
  group: 'Holdings' | 'Clients' | 'Pipelines' | 'People' | 'Money' | 'Product' | 'Knowledge';
}

export const REPORTS: ReportDefinition[] = [
  {
    id: 'holdings-overview',
    name: 'Holdings overview',
    description: 'Revenue, expenses, clients and open work for every company side by side.',
    permission: 'report:read',
    group: 'Holdings',
  },
  {
    id: 'company-performance',
    name: 'Company performance',
    description: 'One row per company: revenue, margin, headcount, pipeline and task load.',
    permission: 'report:read',
    group: 'Holdings',
  },
  {
    id: 'client-health',
    name: 'Client health',
    description: 'Every client with its health score, billing status, overdue work and risks.',
    permission: 'crm:read',
    group: 'Clients',
  },
  {
    id: 'client-profitability',
    name: 'Client profitability',
    description: 'Collected revenue less attributed cost, per client, for the selected period.',
    permission: 'finance:read',
    group: 'Clients',
  },
  {
    id: 'sales-pipeline',
    name: 'Sales pipeline',
    description: 'Open deals by stage with value, probability and weighted value.',
    permission: 'crm:read',
    group: 'Pipelines',
  },
  {
    id: 'investor-pipeline',
    name: 'Investor pipeline',
    description: 'Fundraising pipeline by stage, with weighted value and follow-up dates.',
    permission: 'investor:read',
    group: 'Pipelines',
  },
  {
    id: 'partnership-pipeline',
    name: 'Partnership pipeline',
    description: 'Partnerships by stage and category, with contract status and launch dates.',
    permission: 'partnership:read',
    group: 'Pipelines',
  },
  {
    id: 'team-capacity',
    name: 'Team capacity',
    description: 'Who is allocated where, and who is over or under committed.',
    permission: 'team:read',
    group: 'People',
  },
  {
    id: 'task-completion',
    name: 'Task completion',
    description: 'Open, overdue and completed work by assignee and by client.',
    permission: 'task:read',
    group: 'People',
  },
  {
    id: 'revenue-expenses',
    name: 'Revenue and expenses',
    description: 'Month-by-month revenue, expenses and net — the accountant export.',
    permission: 'finance:read',
    group: 'Money',
  },
  {
    id: 'subscription-performance',
    name: 'Subscription performance',
    description: 'Recurring revenue by plan and status across companies.',
    permission: 'finance:read',
    group: 'Money',
  },
  {
    id: 'parfax-growth',
    name: 'ParFax growth',
    description: 'Signups, paid conversion and scan volume month by month.',
    permission: 'parfax:read',
    requiresCompanySlug: 'parfax',
    group: 'Product',
  },
  {
    id: 'knowledge-activity',
    name: 'Knowledge base activity',
    description: 'What is stored, what is searchable, and what still needs OCR.',
    permission: 'knowledge:read',
    group: 'Knowledge',
  },
];

export function getReport(id: string) {
  return REPORTS.find((r) => r.id === id);
}
