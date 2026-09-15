import * as React from 'react';
import { Badge, type BadgeTone } from './badge';
import { titleCase } from '@/lib/utils';

/**
 * One place that decides what colour a status is, so "overdue" looks the same
 * on a task, an invoice and a client everywhere in the app.
 */
const STATUS_TONES: Record<string, BadgeTone> = {
  // generic
  active: 'success',
  live: 'success',
  complete: 'success',
  completed: 'success',
  done: 'success',
  paid: 'success',
  succeeded: 'success',
  signed: 'success',
  launched: 'success',
  approved: 'success',
  resolved: 'success',
  committed: 'success',
  won: 'success',
  connected: 'success',

  pending: 'warning',
  paused: 'warning',
  on_hold: 'warning',
  in_review: 'warning',
  waiting: 'warning',
  trialing: 'warning',
  past_due: 'warning',
  submitted: 'warning',
  needs_reauth: 'warning',
  drafting: 'warning',
  out_for_signature: 'warning',
  pilot: 'warning',
  partial: 'warning',

  overdue: 'danger',
  blocked: 'danger',
  failed: 'danger',
  error: 'danger',
  suspended: 'danger',
  uncollectible: 'danger',
  disputed: 'danger',
  lost: 'danger',
  declined: 'danger',
  churned: 'danger',
  passed: 'danger',
  not_a_fit: 'danger',
  cancelled: 'danger',
  canceled: 'danger',
  refunded: 'danger',

  in_progress: 'info',
  delivering: 'info',
  running: 'info',
  importing: 'info',
  open: 'info',
  negotiation: 'info',
  due_diligence: 'info',
  meeting_scheduled: 'info',
  first_meeting: 'info',

  prospect: 'accent',
  qualified: 'accent',
  proposal: 'accent',
  onboarding: 'accent',
  renewal: 'gold',
  verbal_interest: 'gold',
  referral_partner: 'gold',

  draft: 'neutral',
  backlog: 'neutral',
  todo: 'neutral',
  archived: 'neutral',
  inactive: 'neutral',
  former: 'neutral',
  void: 'neutral',
  disconnected: 'neutral',
  not_started: 'neutral',
  researching: 'neutral',
  identified: 'neutral',
  skipped: 'neutral',
  none: 'neutral',
};

export function statusTone(status: string | null | undefined): BadgeTone {
  if (!status) return 'neutral';
  return STATUS_TONES[status.toLowerCase()] ?? 'outline';
}

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string | null | undefined;
  label?: string;
  className?: string;
}) {
  if (!status) return <span className="text-[var(--fg-subtle)]">—</span>;
  return (
    <Badge tone={statusTone(status)} className={className}>
      {label ?? titleCase(status)}
    </Badge>
  );
}

const PRIORITY_TONES: Record<string, BadgeTone> = {
  urgent: 'danger',
  high: 'warning',
  normal: 'neutral',
  low: 'outline',
};

export function PriorityBadge({ priority }: { priority: string | null | undefined }) {
  if (!priority) return null;
  return <Badge tone={PRIORITY_TONES[priority] ?? 'neutral'}>{titleCase(priority)}</Badge>;
}

/** Client / partnership health, expressed on a 0–100 scale. */
export function healthTone(score: number): BadgeTone {
  if (score >= 80) return 'success';
  if (score >= 60) return 'gold';
  if (score >= 40) return 'warning';
  return 'danger';
}

export function healthLabel(score: number): string {
  if (score >= 80) return 'Healthy';
  if (score >= 60) return 'Stable';
  if (score >= 40) return 'At risk';
  return 'Critical';
}

export function HealthBadge({ score }: { score: number }) {
  return (
    <Badge tone={healthTone(score)} className="tnum">
      {healthLabel(score)} · {score}
    </Badge>
  );
}

/**
 * Provenance chip. Demo and forecast data must never be mistaken for a live
 * read of a connected production system.
 */
const SOURCE_META: Record<string, { label: string; tone: BadgeTone }> = {
  demo: { label: 'Demo data', tone: 'gold' },
  manual: { label: 'Manual entry', tone: 'neutral' },
  csv: { label: 'CSV import', tone: 'neutral' },
  import: { label: 'Imported', tone: 'neutral' },
  stripe: { label: 'Stripe', tone: 'accent' },
  gusto: { label: 'Gusto', tone: 'accent' },
  clickup: { label: 'ClickUp', tone: 'accent' },
  google_calendar: { label: 'Google Calendar', tone: 'accent' },
  parfax_crm: { label: 'ParFax CRM', tone: 'accent' },
  internal: { label: 'Internal', tone: 'neutral' },
  raw: { label: 'Production data', tone: 'success' },
  calculated: { label: 'Calculated', tone: 'info' },
  forecast: { label: 'Forecast', tone: 'warning' },
  target: { label: 'Target', tone: 'gold' },
};

export function SourceBadge({ source, isDemo }: { source: string | null | undefined; isDemo?: boolean }) {
  if (isDemo) return <Badge tone="gold">Demo data</Badge>;
  if (!source) return null;
  const meta = SOURCE_META[source] ?? { label: titleCase(source), tone: 'outline' as BadgeTone };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}
