export const MEETING_TEMPLATES = [
  {
    id: 'client_call',
    label: 'Client call',
    agenda: `1. Wins since last call\n2. Performance against plan\n3. Blockers and decisions needed\n4. Next 30 days\n5. Open questions`,
  },
  {
    id: 'sales_call',
    label: 'Sales call',
    agenda: `1. Their situation today\n2. What is not working and what it costs\n3. What success would look like\n4. Budget, timeline and decision process\n5. Proposed next step`,
  },
  {
    id: 'investor_call',
    label: 'Investor call',
    agenda: `1. Company overview and traction\n2. Market and wedge\n3. Metrics and unit economics\n4. Team\n5. Raise, use of funds and timeline\n6. Their questions and process`,
  },
  {
    id: 'partnership_call',
    label: 'Partnership call',
    agenda: `1. What each side brings\n2. Proposed structure and revenue share\n3. Pilot scope and location\n4. Equipment, training and support\n5. Success criteria\n6. Next step and owner`,
  },
  {
    id: 'team_meeting',
    label: 'Team meeting',
    agenda: `1. Priorities for the week\n2. In flight and at risk\n3. Blockers\n4. Decisions needed\n5. Announcements`,
  },
  {
    id: 'exec_review',
    label: 'Weekly executive review',
    agenda: `1. Revenue, receivables and cash\n2. Client health and renewals\n3. Pipeline: deals, partnerships, investors\n4. People and capacity\n5. Decisions for the week`,
  },
  {
    id: 'product_meeting',
    label: 'Product meeting',
    agenda: `1. What shipped\n2. What is in flight\n3. Metrics and feedback\n4. Trade-offs to decide\n5. Next up`,
  },
  { id: 'general', label: 'General meeting', agenda: `1. Purpose\n2. Discussion\n3. Decisions\n4. Next steps` },
] as const;

export type MeetingTemplateId = (typeof MEETING_TEMPLATES)[number]['id'];

export const MEETING_STATUSES = ['scheduled', 'held', 'cancelled', 'no_show'] as const;

export function templateAgenda(id: string): string {
  return MEETING_TEMPLATES.find((t) => t.id === id)?.agenda ?? '';
}

export interface MeetingRow {
  id: string;
  company_id: string;
  company_name: string;
  title: string;
  template: string;
  location: string | null;
  meeting_url: string | null;
  starts_at: Date;
  ends_at: Date;
  timezone: string;
  all_day: boolean;
  agenda: string | null;
  notes: string | null;
  decisions: string | null;
  follow_up_date: string | null;
  status: string;
  owner_name: string | null;
  client_id: string | null;
  client_name: string | null;
  project_id: string | null;
  source: string;
  external_url: string | null;
  calendar_name: string | null;
  participant_count: number;
  action_item_count: number;
  open_action_items: number;
  is_demo: boolean;
}
