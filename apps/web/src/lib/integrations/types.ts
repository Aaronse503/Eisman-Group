import type { ProviderId } from './registry';

export type ConnectionMode = 'disconnected' | 'demo' | 'live';
export type ConnectionStatus = 'disconnected' | 'connected' | 'error' | 'needs_reauth';

export interface IntegrationConnection {
  id: string;
  company_id: string | null;
  provider: ProviderId;
  status: ConnectionStatus;
  mode: ConnectionMode;
  account_name: string | null;
  account_id: string | null;
  scopes: string[];
  config: Record<string, unknown>;
  credentials_encrypted: string | null;
  credentials_hint: string | null;
  last_success_at: Date | null;
  last_attempt_at: Date | null;
  last_error: string | null;
  sync_cursor: Record<string, unknown>;
  write_enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface SyncLogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  at: string;
}

export interface SyncResult {
  recordsRead: number;
  recordsWritten: number;
  conflicts: number;
  log: SyncLogEntry[];
  cursor?: Record<string, unknown>;
  /** Non-fatal problems that make the run "partial" rather than "success". */
  warnings?: string[];
}

export interface SyncContext {
  connection: IntegrationConnection;
  credentials: Record<string, string>;
  companyId: string | null;
  /** True when running against demo fixtures instead of the live provider. */
  demo: boolean;
  log: (level: SyncLogEntry['level'], message: string) => void;
}

export interface ConnectionTest {
  ok: boolean;
  accountName?: string;
  accountId?: string;
  scopes?: string[];
  message: string;
  /** Raw detail for the error panel; never contains the credential itself. */
  detail?: string;
}

export interface FieldMappingProposal {
  entityType: string;
  sourceField: string;
  targetField: string;
  sourceOfTruth: 'remote' | 'local' | 'manual';
  note?: string;
  destructive?: boolean;
}

export interface IntegrationAdapter {
  readonly id: ProviderId;
  /** Verifies credentials. Must never report success without a real check. */
  test(credentials: Record<string, string>, config: Record<string, unknown>): Promise<ConnectionTest>;
  /** Pulls data into the local database. Idempotent across runs. */
  sync(ctx: SyncContext): Promise<SyncResult>;
  /** Optional: the field map this connector proposes, for review before use. */
  proposeFieldMappings?(ctx: SyncContext): Promise<FieldMappingProposal[]>;
}

export class IntegrationError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'IntegrationError';
  }
}

/**
 * Small fetch wrapper used by every live adapter: enforces a timeout, never
 * logs the Authorization header, and turns non-2xx responses into an
 * IntegrationError carrying a safe, truncated body for the error panel.
 */
export async function providerFetch(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<unknown> {
  const { timeoutMs = 20_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: controller.signal, cache: 'no-store' });
    const text = await res.text();
    if (!res.ok) {
      throw new IntegrationError(
        `${res.status} ${res.statusText} from ${new URL(url).host}`,
        text.slice(0, 600),
      );
    }
    return text ? JSON.parse(text) : null;
  } catch (err) {
    if (err instanceof IntegrationError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new IntegrationError(`Request to ${new URL(url).host} timed out after ${timeoutMs}ms.`);
    }
    throw new IntegrationError(
      `Could not reach ${new URL(url).host}.`,
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    clearTimeout(timer);
  }
}
