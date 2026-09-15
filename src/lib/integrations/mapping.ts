import { sql } from '@/lib/db/client';
import { sha256 } from '@/lib/crypto';

/**
 * Upserts a remote record into a local table, keyed by the external id.
 *
 * Re-running a sync updates rather than duplicating, and a content hash
 * detects the case where both sides changed since the last sync — those rows
 * are flagged as conflicts instead of being silently overwritten.
 */
export async function upsertMapped<T extends Record<string, unknown>>(opts: {
  connectionId: string;
  provider: string;
  entityType: string;
  externalId: string;
  table: string;
  values: T;
  /** Columns that identify an existing local row when no mapping exists yet. */
  matchOn?: { column: string; value: unknown }[];
  /** Columns the local user is allowed to own; never overwritten on re-sync. */
  localOwnedColumns?: string[];
}): Promise<{ id: string; action: 'created' | 'updated' | 'conflict' }> {
  const remoteHash = sha256(JSON.stringify(opts.values));

  const existingMap = await sql<{ local_id: string; remote_hash: string | null; local_hash: string | null }>(
    `select local_id, remote_hash, local_hash from external_record_map
     where connection_id = $1 and entity_type = $2 and external_id = $3`,
    [opts.connectionId, opts.entityType, opts.externalId],
  );

  let localId = existingMap[0]?.local_id ?? null;

  if (!localId && opts.matchOn?.length) {
    const where = opts.matchOn.map((m, i) => `${m.column} = $${i + 1}`).join(' and ');
    const found = await sql<{ id: string }>(
      `select id from ${opts.table} where ${where} limit 1`,
      opts.matchOn.map((m) => m.value),
    );
    localId = found[0]?.id ?? null;
  }

  const columns = Object.keys(opts.values);
  const params = Object.values(opts.values);

  if (!localId) {
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(',');
    const inserted = await sql<{ id: string }>(
      `insert into ${opts.table} (${columns.join(',')}) values (${placeholders}) returning id`,
      params,
    );
    localId = inserted[0]!.id;
    await recordMapping(opts.connectionId, opts.provider, opts.entityType, opts.externalId, localId, remoteHash, remoteHash);
    return { id: localId, action: 'created' };
  }

  // Detect a local edit made since the last sync.
  const current = await sql<Record<string, unknown>>(
    `select ${columns.join(',')} from ${opts.table} where id = $1`,
    [localId],
  );
  const currentHash = current[0] ? sha256(JSON.stringify(current[0])) : null;
  const lastSyncedHash = existingMap[0]?.local_hash ?? null;
  const localChanged = Boolean(lastSyncedHash && currentHash && currentHash !== lastSyncedHash);
  const remoteChanged = existingMap[0]?.remote_hash !== remoteHash;

  if (localChanged && remoteChanged) {
    await sql(
      `update external_record_map
         set conflict = true, conflict_detail = $1, last_synced_at = now()
       where connection_id = $2 and entity_type = $3 and external_id = $4`,
      [
        JSON.stringify({ remote: opts.values, local: current[0] }),
        opts.connectionId,
        opts.entityType,
        opts.externalId,
      ],
    );
    return { id: localId, action: 'conflict' };
  }

  const updatable = columns.filter((c) => !opts.localOwnedColumns?.includes(c));
  if (updatable.length) {
    const sets = updatable.map((c, i) => `${c} = $${i + 2}`).join(',');
    await sql(
      `update ${opts.table} set ${sets} where id = $1`,
      [localId, ...updatable.map((c) => opts.values[c])],
    );
  }
  const after = await sql<Record<string, unknown>>(
    `select ${columns.join(',')} from ${opts.table} where id = $1`,
    [localId],
  );
  await recordMapping(
    opts.connectionId,
    opts.provider,
    opts.entityType,
    opts.externalId,
    localId,
    remoteHash,
    after[0] ? sha256(JSON.stringify(after[0])) : remoteHash,
  );
  return { id: localId, action: 'updated' };
}

async function recordMapping(
  connectionId: string,
  provider: string,
  entityType: string,
  externalId: string,
  localId: string,
  remoteHash: string,
  localHash: string,
) {
  await sql(
    `insert into external_record_map
       (connection_id, provider, entity_type, external_id, local_id, remote_hash, local_hash, conflict)
     values ($1,$2,$3,$4,$5,$6,$7,false)
     on conflict (connection_id, entity_type, external_id) do update
       set local_id = excluded.local_id,
           remote_hash = excluded.remote_hash,
           local_hash = excluded.local_hash,
           conflict = false,
           conflict_detail = null,
           last_synced_at = now()`,
    [connectionId, provider, entityType, externalId, localId, remoteHash, localHash],
  );
}
