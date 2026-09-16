import { z } from 'zod';
import {
  money, optionalDate, optionalEmail, optionalString, optionalUrl, optionalUuid, percent,
} from './schemas';
import {
  CLIENT_STAGES, CLIENT_STATUSES, CONTACT_ROLES, DEAL_STAGES, ORGANIZATION_ROLES,
} from '@/lib/domain/crm';

/**
 * CRM input schemas. These live outside the server-action module because a
 * `'use server'` file may only export async functions, and both the actions
 * and the client-side forms need them.
 */

export const clientSchema = z.object({
  companyId: z.string().uuid('Choose a company'),
  name: z.string().trim().min(2, 'Give the client a name').max(160),
  status: z.enum(CLIENT_STATUSES).default('prospect'),
  stage: z.enum(CLIENT_STAGES).default('new'),
  organizationId: optionalUuid,
  accountOwnerId: optionalUuid,
  website: optionalUrl,
  linkedin: optionalUrl,
  instagram: optionalUrl,
  services: z
    .union([z.string(), z.array(z.string())])
    .nullish()
    .transform((v) => {
      const items = Array.isArray(v) ? v : (v ?? '').split(',');
      return [...new Set(items.map((s) => s.trim()).filter(Boolean))].slice(0, 20);
    }),
  monthlyRetainer: money,
  contractValue: money,
  currency: z.string().trim().length(3).toUpperCase().default('USD'),
  contractStart: optionalDate,
  contractEnd: optionalDate,
  renewalDate: optionalDate,
  billingStatus: z.enum(['current', 'pending', 'overdue', 'on_hold', 'not_billed']).default('current'),
  healthScore: percent.default(70),
  goals: optionalString,
  deliverables: optionalString,
  kpis: optionalString,
  risks: optionalString,
  nextAction: optionalString,
  nextActionDate: optionalDate,
});

export const contactSchema = z.object({
  companyId: z.string().uuid('Choose a company'),
  organizationId: optionalUuid,
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: z.string().trim().max(80).nullish().transform((v) => v || null),
  email: optionalEmail,
  secondaryEmail: optionalEmail,
  phone: optionalString,
  title: optionalString,
  linkedinUrl: optionalUrl,
  twitterUrl: optionalUrl,
  city: optionalString,
  country: optionalString,
  timezone: optionalString,
  description: optionalString,
  ownerUserId: optionalUuid,
  roles: z
    .union([z.string(), z.array(z.string())])
    .nullish()
    .transform((v) => {
      const items = Array.isArray(v) ? v : (v ?? '').split(',');
      return items
        .map((s) => s.trim())
        .filter((s): s is (typeof CONTACT_ROLES)[number] =>
          (CONTACT_ROLES as readonly string[]).includes(s),
        );
    }),
  clientId: optionalUuid,
});

export const organizationSchema = z.object({
  companyId: z.string().uuid('Choose a company'),
  name: z.string().trim().min(2, 'Give the organization a name').max(160),
  legalName: optionalString,
  domain: optionalString,
  website: optionalUrl,
  industry: optionalString,
  sizeBand: optionalString,
  description: optionalString,
  linkedinUrl: optionalUrl,
  city: optionalString,
  region: optionalString,
  country: optionalString,
  ownerUserId: optionalUuid,
  roles: z
    .union([z.string(), z.array(z.string())])
    .nullish()
    .transform((v) => {
      const items = Array.isArray(v) ? v : (v ?? '').split(',');
      return items
        .map((s) => s.trim())
        .filter((s) => (ORGANIZATION_ROLES as readonly string[]).includes(s));
    }),
});

export const dealSchema = z.object({
  companyId: z.string().uuid('Choose a company'),
  name: z.string().trim().min(2, 'Give the deal a name').max(160),
  stage: z.enum(DEAL_STAGES).default('discovery'),
  clientId: optionalUuid,
  organizationId: optionalUuid,
  primaryContactId: optionalUuid,
  value: money,
  currency: z.string().trim().length(3).toUpperCase().default('USD'),
  probability: percent.default(20),
  expectedClose: optionalDate,
  source: optionalString,
  ownerUserId: optionalUuid,
  notes: optionalString,
});

export type ClientInput = z.output<typeof clientSchema>;
export type ContactInput = z.output<typeof contactSchema>;
export type OrganizationInput = z.output<typeof organizationSchema>;
export type DealInput = z.output<typeof dealSchema>;
