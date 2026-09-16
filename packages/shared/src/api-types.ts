/**
 * The contract between the mobile application and the web application's HTTP
 * API. Both sides import these, so a change that breaks one fails to compile
 * on the other.
 */
import type { Permission, Role, RoleGrant } from './permissions';

export const API_VERSION = 'v1';

// ------------------------------------------------------------------ envelope

export interface ApiError {
  error: string;
  /** Machine-readable, for the cases the interface reacts to differently. */
  code?:
    | 'unauthenticated'
    | 'forbidden'
    | 'not_found'
    | 'invalid_input'
    | 'rate_limited'
    | 'conflict'
    | 'must_change_password'
    | 'server_error';
  /** Field-level messages, keyed by field name. */
  fields?: Record<string, string>;
}

export interface Paginated<T> {
  items: T[];
  /** Cursor for the next page; absent when there are no more. */
  nextCursor?: string;
  total?: number;
}

// -------------------------------------------------------------------- session

export interface ApiUser {
  id: string;
  email: string;
  name: string;
  title: string | null;
  avatarUrl: string | null;
  timezone: string;
  isDemo: boolean;
  mustChangePassword: boolean;
}

export interface ApiCompany {
  id: string;
  slug: string;
  name: string;
  status: string;
  brandColor: string;
  accentColor: string;
  currency: string;
  isDemo: boolean;
}

export interface SessionResponse {
  token: string;
  expiresAt: string;
  user: ApiUser;
  companies: ApiCompany[];
  grants: RoleGrant[];
  roles: Role[];
  permissions: Permission[];
  /** True when this deployment is showing demo data. */
  demoMode: boolean;
  /** Whether this server can actually push notifications to a device. */
  push: PushCapability;
}

export interface PushCapability {
  /** False means notifications are recorded but never pushed anywhere. */
  configured: boolean;
  /** Why it is not configured, worth showing rather than hiding. */
  reason: string | null;
}

export interface SignInRequest {
  email: string;
  password: string;
  device?: DeviceInfo;
}

export interface DeviceInfo {
  /** Stable per installation, generated on first run. */
  installationId: string;
  platform: 'ios' | 'android' | 'web';
  model?: string;
  osVersion?: string;
  appVersion?: string;
}

export interface RegisterPushTokenRequest {
  installationId: string;
  expoPushToken: string;
  platform: 'ios' | 'android';
}

// ------------------------------------------------------------------ dashboard

export interface DashboardMetric {
  key: string;
  label: string;
  value: string;
  /** The raw figure, for sorting or charting. */
  raw: number | null;
  hint?: string;
  deltaPercent?: number | null;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  href?: string;
}

export interface DashboardResponse {
  scope: { slug: string; label: string; isHoldings: boolean };
  range: { preset: string; label: string; from: string; to: string; comparisonLabel: string };
  headline: DashboardMetric[];
  supporting: DashboardMetric[];
  parfax: DashboardMetric[] | null;
  /** Every figure names where it came from. */
  source: string;
  includesDemoData: boolean;
}

// -------------------------------------------------------------------- records

export interface ActivityEntry {
  id: string;
  summary: string;
  action: string;
  actorName: string | null;
  companyName: string | null;
  entityType: string;
  entityId: string | null;
  href: string | null;
  at: string;
  isDemo: boolean;
}

export interface SearchHit {
  id: string;
  type: 'client' | 'contact' | 'organization' | 'task' | 'meeting' | 'document' | 'note' | 'partnership' | 'investor' | 'parfax_user';
  title: string;
  subtitle: string | null;
  companyName: string | null;
  href: string;
  isDemo: boolean;
}

export interface ClientSummary {
  id: string;
  name: string;
  status: string;
  stage: string;
  healthScore: number;
  monthlyRetainer: number;
  companyName: string;
  companyId: string;
  ownerName: string | null;
  openTasks: number;
  renewalDate: string | null;
  isDemo: boolean;
}

export interface ContactSummary {
  id: string;
  fullName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  companyName: string;
  companyId: string;
  organizationName: string | null;
  clientNames: string[];
  isDemo: boolean;
}

export interface TaskSummary {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  companyId: string;
  companyName: string;
  clientName: string | null;
  assigneeName: string | null;
  isOverdue: boolean;
  subtaskCount: number;
  subtasksDone: number;
  isDemo: boolean;
  /** Present only for a task created on the device and not yet accepted. */
  pendingSync?: boolean;
}

export interface MeetingSummary {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  conferenceUrl: string | null;
  clientName: string | null;
  companyName: string;
  participantCount: number;
  status: string;
  isDemo: boolean;
}

export interface NoteSummary {
  id: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  entityLabel: string | null;
  authorName: string | null;
  createdAt: string;
  isDemo: boolean;
  pendingSync?: boolean;
}

export interface PipelineEntry {
  id: string;
  name: string;
  stage: string;
  value: number;
  probability: number | null;
  ownerName: string | null;
  nextFollowUpAt: string | null;
  isDemo: boolean;
}

export interface ParfaxUserSummary {
  id: string;
  name: string | null;
  email: string;
  plan: string;
  status: string;
  signupAt: string;
  lastActiveAt: string | null;
  scanCount: number;
  isDemo: boolean;
}

export interface DocumentSummary {
  id: string;
  name: string;
  summary: string | null;
  folderName: string | null;
  sizeBytes: number | null;
  mimeType: string | null;
  updatedAt: string;
  textStatus: string;
  isDemo: boolean;
}

// ----------------------------------------------------------------- offline sync

/** A change made on the device while it had no connection. */
export interface QueuedMutation {
  /** Generated on the device; the server uses it to apply each change once. */
  clientId: string;
  kind: 'task.create' | 'task.complete' | 'note.create' | 'contact.create';
  createdAt: string;
  payload: unknown;
}

export interface SyncRequest {
  mutations: QueuedMutation[];
}

export interface SyncResultEntry {
  clientId: string;
  status: 'applied' | 'duplicate' | 'failed';
  /** The server-side id, once the record exists. */
  id?: string;
  error?: string;
}

export interface SyncResponse {
  results: SyncResultEntry[];
  serverTime: string;
}
