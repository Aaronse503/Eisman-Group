import { sql, one } from '@/lib/db/client';
import { decryptSecret, encryptSecret, credentialHint } from '@/lib/crypto';
import { getEnv } from '@/lib/env';
import { recordAudit } from '@/lib/audit';
import { recordActivity } from '@/lib/activity';
import type { Actor } from '@/lib/auth/actor';
import { getAdapter } from './adapters';
import { getProvider, PROVIDERS, type ProviderId } from './registry';
import type {
  ConnectionTest,
  IntegrationConnection,
  SyncLogEntry,
  SyncResult,
} from './types';
import { IntegrationError } from './types';

export interface ConnectionView extends IntegrationConnection {
  company_name: string | null;
  last_run: {
    id: string;
    status: string;
    started_at: Date;
    finished_at: Date | null;
    records_read: number;
    records_written: number;
    conflicts: number;
    error: string | null;
    trigger: string;
  } | null;
  /** Credential keys supplied by server environment variables. */
  env_supplied: string[];
  conflict_count: number;
}

export async function listConnections(companyIds: string[] | null): Promise<ConnectionView[]> {
  const rows = await sql<ConnectionView>(
    `select c.*, co.name as company_name,
            (select count(*)::int from external_record_map m
              where m.connection_id = c.id and m.conflict) as conflict_count
     from integration_connections c
     left join companies co on co.id = c.company_id
     where $1::uuid[] is null or c.company_id is null or c.company_id = any($1)
     order by c.provider`,
    [companyIds],
  );

  for (const row of rows) {
    const runs = await sql<NonNullable<ConnectionView['last_run']>>(
      `select id, status, started_at, finished_at, records_read, records_written,
              conflicts, error, trigger
       from integration_sync_runs where connection_id = $1
       order by started_at desc limit 1`,
      [row.id],
    );
    row.last_run = runs[0] ?? null;
    row.env_supplied = envSuppliedKeys(row.provider);
  }
  return rows;
}

export function envSuppliedKeys(provider: ProviderId): string[] {
  const def = getProvider(provider);
  if (!def) return [];
  const env = process.env;
  return def.credentialFields
    .filter((f) => f.envVar && env[f.envVar]?.trim())
    .map((f) => f.key);
}

export async function getConnection(id: string): Promise<IntegrationConnection | null> {
  return one<IntegrationConnection>(`select * from integration_connections where id = $1`, [id]);
}

export async function ensureConnection(provider: ProviderId, companyId: string | null) {
  const existing = await one<IntegrationConnection>(
    `select * from integration_connections
     where provider = $1 and coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)
           = coalesce($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)`,
    [provider, companyId],
  );
  if (existing) return existing;
  return one<IntegrationConnection>(
    `insert into integration_connections (provider, company_id) values ($1,$2) returning *`,
    [provider, companyId],
  );
}

/**
 * Merges stored (encrypted) credentials with any supplied by environment
 * variables. Environment values win, so a server-managed secret is never
 * shadowed by a stale one pasted into the UI.
 */
export function resolveCredentials(connection: IntegrationConnection): Record<string, string> {
  const def = getProvider(connection.provider);
  const stored: Record<string, string> = connection.credentials_encrypted
    ? JSON.parse(decryptSecret(connection.credentials_encrypted))
    : {};
  const out = { ...stored };
  for (const field of def?.credentialFields ?? []) {
    const fromEnv = field.envVar ? process.env[field.envVar]?.trim() : undefined;
    if (fromEnv) out[field.key] = fromEnv;
  }
  return out;
}

export function hasUsableCredentials(connection: IntegrationConnection): boolean {
  const def = getProvider(connection.provider);
  if (!def) return false;
  const creds = resolveCredentials(connection);
  return def.credentialFields.filter((f) => f.required).every((f) => Boolean(creds[f.key]));
}

export async function saveCredentials(opts: {
  connectionId: string;
  credentials: Record<string, string>;
  actor: Actor;
  config?: Record<string, unknown>;
}) {
  const connection = await getConnection(opts.connectionId);
  if (!connection) throw new IntegrationError('Connection not found.');
  const existing: Record<string, string> = connection.credentials_encrypted
    ? JSON.parse(decryptSecret(connection.credentials_encrypted))
    : {};
  // Blank fields keep the stored value; they are not a request to clear it.
  const merged = { ...existing };
  for (const [key, value] of Object.entries(opts.credentials)) {
    if (value?.trim()) merged[key] = value.trim();
  }
  const def = getProvider(connection.provider);
  const primary = def?.credentialFields.find((f) => f.required)?.key;
  await sql(
    `update integration_connections
       set credentials_encrypted = $2,
           credentials_hint = $3,
           config = coalesce($4::jsonb, config)
     where id = $1`,
    [
      opts.connectionId,
      encryptSecret(JSON.stringify(merged)),
      primary && merged[primary] ? credentialHint(merged[primary]) : null,
      opts.config ? JSON.stringify(opts.config) : null,
    ],
  );
  await recordAudit({
    actor: opts.actor,
    companyId: connection.company_id,
    action: 'integration.credentials_saved',
    entityType: 'integration_connection',
    entityId: connection.id,
    entityLabel: connection.provider,
    severity: 'notice',
    after: { fields: Object.keys(opts.credentials) },
  });
  return { ok: true as const };
}

export async function testConnection(connectionId: string, actor: Actor): Promise<ConnectionTest> {
  const connection = await getConnection(connectionId);
  if (!connection) throw new IntegrationError('Connection not found.');
  const adapter = getAdapter(connection.provider);
  if (!adapter) {
    return { ok: false, message: `No adapter is implemented for ${connection.provider}.` };
  }
  await sql(`update integration_connections set last_attempt_at = now() where id = $1`, [connectionId]);
  try {
    const result = await adapter.test(resolveCredentials(connection), connection.config);
    await sql(
      `update integration_connections
         set status = $2, mode = $3, account_name = $4, account_id = $5,
             scopes = $6, last_error = $7, last_success_at = case when $2 = 'connected' then now() else last_success_at end
       where id = $1`,
      [
        connectionId,
        result.ok ? 'connected' : 'error',
        result.ok ? 'live' : connection.mode === 'demo' ? 'demo' : 'disconnected',
        result.accountName ?? null,
        result.accountId ?? null,
        result.scopes ?? [],
        result.ok ? null : `${result.message}${result.detail ? ` — ${result.detail}` : ''}`,
      ],
    );
    await recordAudit({
      actor,
      companyId: connection.company_id,
      action: result.ok ? 'integration.connected' : 'integration.connect_failed',
      entityType: 'integration_connection',
      entityId: connectionId,
      entityLabel: connection.provider,
      severity: result.ok ? 'notice' : 'warning',
      after: { accountName: result.accountName, scopes: result.scopes },
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const detail = err instanceof IntegrationError ? err.detail : undefined;
    await sql(
      `update integration_connections set status = 'error', last_error = $2 where id = $1`,
      [connectionId, `${message}${detail ? ` — ${detail}` : ''}`],
    );
    await recordAudit({
      actor,
      companyId: connection.company_id,
      action: 'integration.connect_failed',
      entityType: 'integration_connection',
      entityId: connectionId,
      entityLabel: connection.provider,
      reason: message,
      severity: 'warning',
    });
    return { ok: false, message, detail };
  }
}

export async function setMode(connectionId: string, mode: 'demo' | 'disconnected', actor: Actor) {
  const connection = await getConnection(connectionId);
  if (!connection) throw new IntegrationError('Connection not found.');
  if (mode === 'demo' && !getEnv().DEMO_MODE) {
    throw new IntegrationError('Demo mode is disabled on this deployment.');
  }
  await sql(
    `update integration_connections
       set mode = $2,
           status = case when $2 = 'demo' then 'connected' else 'disconnected' end,
           account_name = case when $2 = 'demo' then 'Demo Mode (sample data)' else null end,
           last_error = null
     where id = $1`,
    [connectionId, mode],
  );
  await recordAudit({
    actor,
    companyId: connection.company_id,
    action: mode === 'demo' ? 'integration.demo_mode_enabled' : 'integration.disconnected',
    entityType: 'integration_connection',
    entityId: connectionId,
    entityLabel: connection.provider,
    severity: 'notice',
    before: { mode: connection.mode },
    after: { mode },
  });
}

export async function disconnect(connectionId: string, actor: Actor) {
  const connection = await getConnection(connectionId);
  if (!connection) throw new IntegrationError('Connection not found.');
  await sql(
    `update integration_connections
       set status = 'disconnected', mode = 'disconnected', credentials_encrypted = null,
           credentials_hint = null, account_name = null, account_id = null, scopes = '{}',
           last_error = null, write_enabled = false
     where id = $1`,
    [connectionId],
  );
  await recordAudit({
    actor,
    companyId: connection.company_id,
    action: 'integration.disconnected',
    entityType: 'integration_connection',
    entityId: connectionId,
    entityLabel: connection.provider,
    severity: 'notice',
    before: { status: connection.status, mode: connection.mode, account: connection.account_name },
  });
}

export async function setWriteEnabled(connectionId: string, enabled: boolean, reason: string, actor: Actor) {
  const connection = await getConnection(connectionId);
  if (!connection) throw new IntegrationError('Connection not found.');
  if (enabled && !reason.trim()) {
    throw new IntegrationError('A reason is required to enable write-back.');
  }
  await sql(`update integration_connections set write_enabled = $2 where id = $1`, [
    connectionId,
    enabled,
  ]);
  await recordAudit({
    actor,
    companyId: connection.company_id,
    action: enabled ? 'integration.writeback_enabled' : 'integration.writeback_disabled',
    entityType: 'integration_connection',
    entityId: connectionId,
    entityLabel: connection.provider,
    reason,
    severity: 'critical',
    before: { write_enabled: connection.write_enabled },
    after: { write_enabled: enabled },
  });
}

export interface RunSyncOptions {
  connectionId: string;
  trigger: 'manual' | 'scheduled' | 'webhook' | 'startup';
  actor?: Actor | null;
}

/**
 * Executes one sync run and records it. A run is always persisted, including
 * failures, so the Integrations page can show the last attempt honestly.
 */
export async function runSync(opts: RunSyncOptions) {
  const connection = await getConnection(opts.connectionId);
  if (!connection) throw new IntegrationError('Connection not found.');
  if (connection.mode === 'disconnected') {
    throw new IntegrationError(
      `${connection.provider} is not connected. Add credentials or enable Demo Mode first.`,
    );
  }
  const adapter = getAdapter(connection.provider);
  if (!adapter) throw new IntegrationError(`No adapter is implemented for ${connection.provider}.`);

  const [run] = await sql<{ id: string }>(
    `insert into integration_sync_runs (connection_id, trigger, status, actor_user_id)
     values ($1,$2,'running',$3) returning id`,
    [connection.id, opts.trigger, opts.actor?.user.id ?? null],
  );
  await sql(`update integration_connections set last_attempt_at = now() where id = $1`, [connection.id]);

  const entries: SyncLogEntry[] = [];
  try {
    const result: SyncResult = await adapter.sync({
      connection,
      credentials: resolveCredentials(connection),
      companyId: connection.company_id,
      demo: connection.mode === 'demo',
      log: (level, message) => entries.push({ level, message, at: new Date().toISOString() }),
    });
    const status = result.warnings?.length ? 'partial' : 'success';
    await sql(
      `update integration_sync_runs
         set status = $2, finished_at = now(), records_read = $3, records_written = $4,
             conflicts = $5, log = $6, error = $7
       where id = $1`,
      [
        run!.id,
        status,
        result.recordsRead,
        result.recordsWritten,
        result.conflicts,
        JSON.stringify([...entries, ...result.log]),
        result.warnings?.join(' ') ?? null,
      ],
    );
    await sql(
      `update integration_connections
         set last_success_at = now(), last_error = $2, status = 'connected',
             sync_cursor = coalesce($3::jsonb, sync_cursor)
       where id = $1`,
      [connection.id, result.warnings?.join(' ') ?? null, result.cursor ? JSON.stringify(result.cursor) : null],
    );
    await recordActivity({
      actor: opts.actor ?? null,
      companyId: connection.company_id,
      entityType: 'integration_connection',
      entityId: connection.id,
      action: 'synced',
      summary: `${connection.provider} sync ${status}: ${result.recordsWritten} record(s) written${connection.mode === 'demo' ? ' (demo mode)' : ''}`,
    });
    await recordAudit({
      actor: opts.actor ?? null,
      companyId: connection.company_id,
      action: 'integration.sync',
      entityType: 'integration_connection',
      entityId: connection.id,
      entityLabel: connection.provider,
      after: {
        status,
        mode: connection.mode,
        recordsRead: result.recordsRead,
        recordsWritten: result.recordsWritten,
        conflicts: result.conflicts,
      },
    });
    return { runId: run!.id, status, ...result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const detail = err instanceof IntegrationError ? err.detail : undefined;
    await sql(
      `update integration_sync_runs
         set status = 'failed', finished_at = now(), error = $2, log = $3 where id = $1`,
      [run!.id, `${message}${detail ? ` — ${detail}` : ''}`, JSON.stringify(entries)],
    );
    await sql(
      `update integration_connections set status = 'error', last_error = $2 where id = $1`,
      [connection.id, message],
    );
    await recordAudit({
      actor: opts.actor ?? null,
      companyId: connection.company_id,
      action: 'integration.sync_failed',
      entityType: 'integration_connection',
      entityId: connection.id,
      entityLabel: connection.provider,
      reason: message,
      severity: 'warning',
    });
    throw err;
  }
}

export async function listSyncRuns(connectionId: string, limit = 20) {
  return sql<{
    id: string;
    trigger: string;
    status: string;
    started_at: Date;
    finished_at: Date | null;
    records_read: number;
    records_written: number;
    conflicts: number;
    error: string | null;
    log: SyncLogEntry[];
  }>(
    `select id, trigger, status, started_at, finished_at, records_read, records_written,
            conflicts, error, log
     from integration_sync_runs where connection_id = $1
     order by started_at desc limit $2`,
    [connectionId, limit],
  );
}

export async function syncAllConnected(trigger: 'scheduled' | 'startup') {
  const rows = await sql<{ id: string; provider: string }>(
    `select id, provider from integration_connections where mode <> 'disconnected'`,
  );
  const results: { provider: string; ok: boolean; error?: string }[] = [];
  for (const row of rows) {
    try {
      await runSync({ connectionId: row.id, trigger });
      results.push({ provider: row.provider, ok: true });
    } catch (err) {
      results.push({
        provider: row.provider,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

export { PROVIDERS };
