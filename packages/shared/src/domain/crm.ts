/**
 * Client-safe CRM domain model: enumerations and row shapes.
 *
 * Kept separate from `lib/queries/crm` so client components can import the
 * constants without dragging the database driver into the browser bundle.
 */

export const CLIENT_STATUSES = ['prospect', 'active', 'paused', 'former', 'referral_partner'] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const CLIENT_STAGES = [
  'new', 'qualifying', 'proposal', 'negotiation', 'onboarding',
  'delivering', 'renewal', 'offboarding', 'closed',
] as const;
export type ClientStage = (typeof CLIENT_STAGES)[number];

export const BILLING_STATUSES = ['current', 'pending', 'overdue', 'on_hold', 'not_billed'] as const;

export const DEAL_STAGES = ['discovery', 'qualified', 'proposal', 'negotiation', 'won', 'lost'] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export const CONTACT_ROLES = [
  'client', 'prospect', 'investor', 'advisor', 'partner', 'vendor',
  'contractor', 'employee', 'referral_partner', 'media', 'ambassador',
] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];

export const ORGANIZATION_ROLES = [
  'client', 'prospect', 'vendor', 'partner', 'investor',
  'agency', 'media', 'oem', 'retailer', 'course', 'technology',
] as const;

export const CURRENCIES = ['USD', 'CAD', 'GBP', 'EUR', 'AUD'] as const;

export interface ClientRow {
  id: string;
  company_id: string;
  company_name: string;
  organization_id: string | null;
  name: string;
  status: string;
  stage: string;
  account_owner_id: string | null;
  owner_name: string | null;
  website: string | null;
  services: string[];
  monthly_retainer: number;
  contract_value: number;
  currency: string;
  contract_start: string | null;
  contract_end: string | null;
  renewal_date: string | null;
  billing_status: string;
  health_score: number;
  next_action: string | null;
  next_action_date: string | null;
  last_activity_at: Date | null;
  open_tasks: number;
  overdue_tasks: number;
  outstanding: number;
  contacts: number;
  is_demo: boolean;
  created_at: Date;
}

export interface ContactRow {
  id: string;
  company_id: string;
  company_name: string;
  organization_id: string | null;
  organization_name: string | null;
  first_name: string;
  last_name: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  linkedin_url: string | null;
  city: string | null;
  country: string | null;
  status: string;
  owner_name: string | null;
  roles: string[];
  is_demo: boolean;
  created_at: Date;
}

export interface OrganizationRow {
  id: string;
  company_id: string;
  company_name: string;
  name: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  size_band: string | null;
  city: string | null;
  country: string | null;
  status: string;
  owner_name: string | null;
  roles: string[];
  contacts: number;
  is_demo: boolean;
  created_at: Date;
}

export interface DealRow {
  id: string;
  company_id: string;
  company_name: string;
  name: string;
  stage: string;
  value: number;
  currency: string;
  probability: number;
  expected_close: string | null;
  source: string | null;
  owner_name: string | null;
  client_id: string | null;
  client_name: string | null;
  organization_name: string | null;
  is_demo: boolean;
  created_at: Date;
}
