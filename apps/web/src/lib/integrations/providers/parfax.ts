import { upsertMapped } from '../mapping';
import {
  providerFetch,
  IntegrationError,
  type FieldMappingProposal,
  type IntegrationAdapter,
  type SyncContext,
  type SyncResult,
} from '../types';

/**
 * ParFax connector.
 *
 * The current ParFax system of record has not been identified yet, so this is
 * deliberately provider-neutral: it speaks a small, documented REST shape and
 * degrades to the CSV/JSON import wizard when that shape is not available.
 *
 * It is read-only until write-back is explicitly approved on the connection,
 * and it proposes a field map for review before any data is trusted.
 */

export interface ParfaxUserRecord {
  id: string;
  email: string;
  name?: string | null;
  handle?: string | null;
  plan?: string | null;
  status?: string | null;
  created_at?: string | null;
  last_active_at?: string | null;
  country?: string | null;
  region?: string | null;
  source?: string | null;
  lifetime_value?: number | null;
}

export interface ParfaxScanRecord {
  id: string;
  user_id?: string | null;
  scanned_at: string;
  brand?: string | null;
  model?: string | null;
  club_type?: string | null;
  confidence?: number | null;
  verified?: boolean | null;
  verified_correct?: boolean | null;
}

const PLANS = new Set(['free', 'plus', 'pro', 'team', 'lifetime']);
const STATUSES = new Set(['active', 'suspended', 'deleted', 'pending']);
const CLUB_TYPES = new Set(['driver', 'fairway', 'hybrid', 'iron', 'wedge', 'putter', 'other']);

function headers(apiKey: string) {
  return { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' };
}

export const parfaxAdapter: IntegrationAdapter = {
  id: 'parfax_crm',

  async test(credentials) {
    const base = credentials.apiBase?.replace(/\/+$/, '');
    const apiKey = credentials.apiKey;
    if (!base || !apiKey) {
      throw new IntegrationError('A ParFax API base URL and key are required.');
    }
    const info = (await providerFetch(`${base}/health`, { headers: headers(apiKey) })) as {
      name?: string;
      environment?: string;
      version?: string;
    } | null;
    return {
      ok: true,
      accountName: info?.name ?? new URL(base).host,
      accountId: base,
      scopes: ['users:read', 'scans:read', 'subscriptions:read'],
      message: `Reached the ParFax API${info?.environment ? ` (${info.environment})` : ''}. The connection is read-only until write-back is approved.`,
    };
  },

  async proposeFieldMappings(): Promise<FieldMappingProposal[]> {
    return [
      { entityType: 'parfax_user', sourceField: 'id', targetField: 'external_id', sourceOfTruth: 'remote', note: 'Stable join key. Never edited locally.' },
      { entityType: 'parfax_user', sourceField: 'email', targetField: 'email', sourceOfTruth: 'remote' },
      { entityType: 'parfax_user', sourceField: 'name', targetField: 'name', sourceOfTruth: 'remote' },
      { entityType: 'parfax_user', sourceField: 'plan', targetField: 'plan', sourceOfTruth: 'remote', note: 'Billing is the system of record for plan. This system never changes it.' },
      { entityType: 'parfax_user', sourceField: 'status', targetField: 'status', sourceOfTruth: 'remote', note: 'Suspend/reactivate from this system writes back only when write-back is enabled.', destructive: true },
      { entityType: 'parfax_user', sourceField: 'created_at', targetField: 'signup_at', sourceOfTruth: 'remote' },
      { entityType: 'parfax_user', sourceField: 'lifetime_value', targetField: 'lifetime_value', sourceOfTruth: 'remote', note: 'Derived in the billing system; treated as read-only here.' },
      { entityType: 'parfax_user', sourceField: '—', targetField: 'promo_access', sourceOfTruth: 'local', note: 'Promotional grants are administered here and audited.' },
      { entityType: 'parfax_scan', sourceField: 'id', targetField: 'external_id', sourceOfTruth: 'remote' },
      { entityType: 'parfax_scan', sourceField: 'scanned_at', targetField: 'scanned_at', sourceOfTruth: 'remote' },
      { entityType: 'parfax_scan', sourceField: 'brand / model', targetField: 'brand / model', sourceOfTruth: 'remote' },
      { entityType: 'parfax_scan', sourceField: 'verified_correct', targetField: 'verified_correct', sourceOfTruth: 'remote', note: 'Drives the scan accuracy metric; must come from production.' },
    ];
  },

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const log: SyncResult['log'] = [];
    const warnings: string[] = [];
    const push = (level: 'info' | 'warn' | 'error', message: string) => {
      log.push({ level, message, at: new Date().toISOString() });
      ctx.log(level, message);
    };

    if (ctx.demo) {
      push(
        'info',
        'Demo mode: the ParFax connector does not fabricate production data. Use Settings → Demo data to load the labelled ParFax demo dataset, or the import wizard to load a real export.',
      );
      return { recordsRead: 0, recordsWritten: 0, conflicts: 0, log, warnings: ['Demo mode performs no ParFax read.'] };
    }

    const base = ctx.credentials.apiBase?.replace(/\/+$/, '');
    const apiKey = ctx.credentials.apiKey;
    if (!base || !apiKey) throw new IntegrationError('A ParFax API base URL and key are required.');

    let users: ParfaxUserRecord[] = [];
    let scans: ParfaxScanRecord[] = [];

    try {
      const res = (await providerFetch(`${base}/users?limit=500`, { headers: headers(apiKey) })) as
        | { data?: ParfaxUserRecord[] }
        | ParfaxUserRecord[];
      users = Array.isArray(res) ? res : (res.data ?? []);
      push('info', `Read ${users.length} ParFax user(s).`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`ParFax /users unavailable: ${message}`);
      push('warn', `Could not read users (${message}). Use ParFax Admin → Import to load a CSV or JSON export instead.`);
    }

    try {
      const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
      const res = (await providerFetch(`${base}/scans?since=${since}&limit=2000`, {
        headers: headers(apiKey),
      })) as { data?: ParfaxScanRecord[] } | ParfaxScanRecord[];
      scans = Array.isArray(res) ? res : (res.data ?? []);
      push('info', `Read ${scans.length} scan(s).`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`ParFax /scans unavailable: ${message}`);
      push('warn', `Could not read scans (${message}).`);
    }

    let written = 0;
    let conflicts = 0;
    const localByExternal = new Map<string, string>();

    for (const user of users) {
      const r = await upsertMapped({
        connectionId: ctx.connection.id,
        provider: 'parfax_crm',
        entityType: 'parfax_user',
        externalId: user.id,
        table: 'parfax_users',
        values: {
          external_id: user.id,
          email: user.email,
          name: user.name ?? null,
          handle: user.handle ?? null,
          plan: PLANS.has(user.plan ?? '') ? user.plan : 'free',
          status: STATUSES.has(user.status ?? '') ? user.status : 'active',
          signup_at: user.created_at ? new Date(user.created_at) : new Date(),
          last_active_at: user.last_active_at ? new Date(user.last_active_at) : null,
          country: user.country ?? null,
          region: user.region ?? null,
          acquisition_source: user.source ?? null,
          lifetime_value: user.lifetime_value ?? 0,
          source: 'parfax_crm',
          is_demo: false,
        },
        matchOn: [
          { column: 'source', value: 'parfax_crm' },
          { column: 'external_id', value: user.id },
        ],
        // Internal administration lives here and is never clobbered by a read.
        localOwnedColumns: ['promo_access', 'promo_expires_at', 'merged_into_id'],
      });
      localByExternal.set(user.id, r.id);
      if (r.action === 'conflict') conflicts++;
      else written++;
    }

    for (const scan of scans) {
      const r = await upsertMapped({
        connectionId: ctx.connection.id,
        provider: 'parfax_crm',
        entityType: 'parfax_scan',
        externalId: scan.id,
        table: 'parfax_scans',
        values: {
          external_id: scan.id,
          parfax_user_id: scan.user_id ? (localByExternal.get(scan.user_id) ?? null) : null,
          scanned_at: new Date(scan.scanned_at),
          brand: scan.brand ?? null,
          model: scan.model ?? null,
          club_type: CLUB_TYPES.has(scan.club_type ?? '') ? scan.club_type : 'other',
          confidence: scan.confidence ?? null,
          verified: scan.verified ?? null,
          verified_correct: scan.verified_correct ?? null,
          source: 'parfax_crm',
          is_demo: false,
        },
        matchOn: [
          { column: 'source', value: 'parfax_crm' },
          { column: 'external_id', value: scan.id },
        ],
      });
      if (r.action === 'conflict') conflicts++;
      else written++;
    }

    if (!ctx.connection.write_enabled) {
      push('info', 'Write-back is disabled on this connection. Nothing was sent to ParFax.');
    }

    return {
      recordsRead: users.length + scans.length,
      recordsWritten: written,
      conflicts,
      log,
      warnings: warnings.length ? warnings : undefined,
    };
  },
};
