import { z } from 'zod';
import { money, optionalDate, optionalDateTime, optionalString, optionalUrl, optionalUuid, percent } from './schemas';
import {
  CONTRACT_STATUSES, INTEREST_LEVELS, INVESTOR_STAGES, INVESTOR_TYPES,
  OUTREACH_STATUSES, PARTNERSHIP_CATEGORIES, PARTNERSHIP_STAGES,
} from '../domain/growth';

const csv = z
  .union([z.string(), z.array(z.string())])
  .nullish()
  .transform((v) => {
    const items = Array.isArray(v) ? v : (v ?? '').split(',');
    return [...new Set(items.map((s) => s.trim()).filter(Boolean))].slice(0, 30);
  });

export const partnershipSchema = z.object({
  companyId: z.string().uuid('Choose a company'),
  name: z.string().trim().min(2, 'Give the partnership a name').max(200),
  category: z.enum(PARTNERSHIP_CATEGORIES).default('other'),
  stage: z.enum(PARTNERSHIP_STAGES).default('identified'),
  organizationId: optionalUuid,
  estimatedValue: money,
  currency: z.string().trim().length(3).toUpperCase().default('USD'),
  revenueShare: optionalString,
  pilotLocation: optionalString,
  equipmentRequirements: optionalString,
  contractStatus: z.enum(CONTRACT_STATUSES).default('none'),
  launchDate: optionalDate,
  probability: percent.default(20),
  ownerUserId: optionalUuid,
  nextAction: optionalString,
  nextActionDate: optionalDate,
  notes: optionalString,
  contactIds: z.array(z.string().uuid()).default([]),
});

export const investorSchema = z.object({
  pitchingCompanyId: z.string().uuid('Choose which company is raising'),
  name: z.string().trim().min(2, 'Enter the fund or investor name').max(200),
  website: optionalUrl,
  investorType: z.enum(INVESTOR_TYPES).default('vc'),
  checkSizeMin: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((v) => (v === '' || v === undefined || v === null ? null : Number(v))),
  checkSizeMax: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((v) => (v === '' || v === undefined || v === null ? null : Number(v))),
  currency: z.string().trim().length(3).toUpperCase().default('USD'),
  stagePreferences: csv,
  industryFocus: csv,
  geography: optionalString,
  portfolioCompanies: csv,
  warmIntroSource: optionalString,
  ownerUserId: optionalUuid,
  outreachStatus: z.enum(OUTREACH_STATUSES).default('not_started'),
  pipelineStage: z.enum(INVESTOR_STAGES).default('researching'),
  interestLevel: z.enum(INTEREST_LEVELS).default('unknown'),
  probability: percent.default(0),
  potentialAmount: money,
  objections: optionalString,
  requestedMaterials: optionalString,
  dataRoomAccess: z.coerce.boolean().default(false),
  lastContactAt: optionalDateTime,
  nextFollowUpAt: optionalDateTime,
  firstMeetingAt: optionalDateTime,
  notes: optionalString,
  organizationId: optionalUuid,
  contactIds: z.array(z.string().uuid()).default([]),
});

export type PartnershipInput = z.output<typeof partnershipSchema>;
export type InvestorInput = z.output<typeof investorSchema>;
