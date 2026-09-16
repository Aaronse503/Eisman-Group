/** Client-safe domain model for partnerships and the investor pipeline. */

export const PARTNERSHIP_CATEGORIES = [
  'golf_course', 'pro_shop', 'retailer', 'oem', 'investor',
  'technology', 'ambassador', 'media', 'distributor', 'other',
] as const;

export const PARTNERSHIP_STAGES = [
  'identified', 'contacted', 'discovery', 'proposal', 'pilot',
  'negotiation', 'signed', 'launched', 'paused', 'declined',
] as const;

export const CONTRACT_STATUSES = [
  'none', 'drafting', 'in_review', 'out_for_signature', 'signed', 'expired',
] as const;

export interface PartnershipRow {
  id: string;
  company_id: string;
  company_name: string;
  organization_id: string | null;
  organization_name: string | null;
  name: string;
  category: string;
  stage: string;
  estimated_value: number;
  currency: string;
  revenue_share: string | null;
  pilot_location: string | null;
  equipment_requirements: string | null;
  contract_status: string;
  launch_date: string | null;
  probability: number;
  owner_name: string | null;
  last_interaction_at: Date | null;
  next_action: string | null;
  next_action_date: string | null;
  performance: Record<string, number | string>;
  notes: string | null;
  contacts: number;
  open_tasks: number;
  is_demo: boolean;
  created_at: Date;
}

// -------------------------------------------------------------- investors

export const INVESTOR_STAGES = [
  'researching', 'introduction_needed', 'ready_for_outreach', 'contacted',
  'replied', 'meeting_scheduled', 'first_meeting', 'follow_up',
  'due_diligence', 'verbal_interest', 'committed', 'passed', 'not_a_fit',
] as const;
export type InvestorStage = (typeof INVESTOR_STAGES)[number];

/** Stages that are still live in the funnel. */
export const ACTIVE_INVESTOR_STAGES = INVESTOR_STAGES.filter(
  (s) => s !== 'passed' && s !== 'not_a_fit',
);

export const INVESTOR_TYPES = [
  'vc', 'angel', 'family_office', 'strategic', 'pe',
  'accelerator', 'syndicate', 'crowdfunding', 'debt', 'other',
] as const;

export const INVESTOR_TYPE_LABELS: Record<string, string> = {
  vc: 'Venture capital',
  angel: 'Angel',
  family_office: 'Family office',
  strategic: 'Strategic',
  pe: 'Private equity',
  accelerator: 'Accelerator',
  syndicate: 'Syndicate',
  crowdfunding: 'Crowdfunding',
  debt: 'Debt',
  other: 'Other',
};

export const OUTREACH_STATUSES = [
  'not_started', 'queued', 'in_progress', 'responded', 'paused', 'closed',
] as const;

export const INTEREST_LEVELS = ['unknown', 'low', 'medium', 'high'] as const;

export const FUNDING_STAGES = [
  'pre_seed', 'seed', 'series_a', 'series_b', 'series_c', 'growth',
] as const;

export interface InvestorRow {
  id: string;
  company_id: string | null;
  organization_id: string | null;
  name: string;
  website: string | null;
  investor_type: string;
  check_size_min: number | null;
  check_size_max: number | null;
  currency: string;
  stage_preferences: string[];
  industry_focus: string[];
  geography: string | null;
  portfolio_companies: string[];
  warm_intro_source: string | null;
  pitching_company_id: string | null;
  pitching_company_name: string | null;
  owner_name: string | null;
  outreach_status: string;
  pipeline_stage: string;
  interest_level: string;
  probability: number;
  potential_amount: number;
  objections: string | null;
  requested_materials: string | null;
  data_room_access: boolean;
  last_contact_at: Date | null;
  next_follow_up_at: Date | null;
  first_meeting_at: Date | null;
  notes: string | null;
  contact_count: number;
  interaction_count: number;
  primary_contact: string | null;
  is_demo: boolean;
  created_at: Date;
}

/** Default probability by stage — the starting point, editable per investor. */
export const STAGE_PROBABILITY: Record<InvestorStage, number> = {
  researching: 2,
  introduction_needed: 5,
  ready_for_outreach: 8,
  contacted: 10,
  replied: 15,
  meeting_scheduled: 20,
  first_meeting: 25,
  follow_up: 30,
  due_diligence: 45,
  verbal_interest: 70,
  committed: 100,
  passed: 0,
  not_a_fit: 0,
};
