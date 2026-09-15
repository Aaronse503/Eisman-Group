import { z } from 'zod';
import { optionalDate, optionalEmail, optionalString, optionalUuid } from './schemas';

export const memberSchema = z.object({
  companyId: z.string().uuid('Choose a company'),
  fullName: z.string().trim().min(2, 'Enter a name').max(160),
  email: optionalEmail,
  phone: optionalString,
  kind: z.enum(['employee', 'contractor', 'agency', 'advisor']).default('employee'),
  title: z.string().trim().min(2, 'Enter a job title').max(160),
  roleDescription: optionalString,
  departmentId: optionalUuid,
  managerId: optionalUuid,
  userId: optionalUuid,
  contactId: optionalUuid,
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'hourly', 'project']).default('full_time'),
  payRate: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (v === '' || v === undefined || v === null) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }),
  payRateUnit: z
    .string()
    .optional()
    .transform((v) => (['hour', 'day', 'month', 'year', 'project'].includes(v ?? '') ? v! : null)),
  paySchedule: z
    .string()
    .optional()
    .transform((v) =>
      ['weekly', 'biweekly', 'semimonthly', 'monthly', 'on_invoice'].includes(v ?? '') ? v! : null,
    ),
  currency: z.string().trim().length(3).toUpperCase().default('USD'),
  startDate: optionalDate,
  endDate: optionalDate,
  status: z.enum(['active', 'on_leave', 'offboarding', 'inactive']).default('active'),
  skills: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => {
      const items = Array.isArray(v) ? v : (v ?? '').split(',');
      return [...new Set(items.map((s) => s.trim()).filter(Boolean))].slice(0, 30);
    }),
  capacityHours: z.coerce.number().min(0).max(168).default(40),
  location: optionalString,
  isVacant: z.coerce.boolean().default(false),
});

export const reassignSchema = z.object({
  memberId: z.string().uuid(),
  managerId: optionalUuid,
  reason: z.string().trim().min(4, 'Give a reason — reporting changes are audited.'),
});

export type MemberInput = z.output<typeof memberSchema>;
