'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sql, one } from '@/lib/db/client';
import { requireActor, requireCompanyAccess, ForbiddenError } from '@/lib/auth/actor';
import { recordActivity } from '@/lib/activity';
import { recordAudit } from '@/lib/audit';
import { getImportEntity, validateRows } from '@/lib/csv/import';
import { indexSource, removeFromIndex } from '@/lib/knowledge/index-content';
import type { ActionResult } from '@/lib/validation/schemas';

function fail(err: unknown): ActionResult<never> {
  if (err instanceof ForbiddenError) {
    return { ok: false, error: 'You do not have permission to import that here.' };
  }
  return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' };
}

const runSchema = z.object({
  entityId: z.string().min(1),
  companyId: z.string().uuid().nullable(),
  filename: z.string().min(1).max(260),
  mapping: z.record(z.string(), z.string()),
  rows: z.array(z.record(z.string(), z.string())).max(5000),
  duplicateStrategy: z.enum(['skip', 'update', 'create_anyway']).default('skip'),
});

export interface ImportSummary {
  importId: string;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  issues: { row: number; field: string; message: string; value: string }[];
}

/**
 * Runs a validated import.
 *
 * Nothing is written until every row has been validated. Duplicates are
 * detected on the entity's natural key and handled per the chosen strategy,
 * and every created or updated row is recorded against the import so the whole
 * thing can be rolled back.
 */
export async function runImportAction(input: unknown): Promise<ActionResult<ImportSummary>> {
  try {
    const parsed = runSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid import request.' };
    }
    const { entityId, companyId, filename, mapping, rows, duplicateStrategy } = parsed.data;
    const entity = getImportEntity(entityId);
    if (!entity) return { ok: false, error: 'Unknown import type.' };

    if (entity.companyScoped && !companyId) {
      return { ok: false, error: 'Choose which company these records belong to.' };
    }
    const actor = companyId ? await requireCompanyAccess(companyId) : await requireActor();
    if (!actor.can(entity.permission, companyId) || !actor.can('import:run', companyId)) {
      throw new ForbiddenError(entity.permission, companyId);
    }

    const { issues, valid } = validateRows(entity, rows, mapping);

    const importRow = await one<{ id: string }>(
      `insert into imports
         (company_id, entity_type, filename, status, mapping, duplicate_strategy,
          total_rows, errors, raw_sample, created_by_id)
       values ($1,$2,$3,'importing',$4,$5,$6,$7,$8,$9) returning id`,
      [
        companyId, entityId, filename, JSON.stringify(mapping), duplicateStrategy,
        rows.length, JSON.stringify(issues.slice(0, 200)),
        JSON.stringify(rows.slice(0, 3)), actor.user.id,
      ],
    );
    const importId = importRow!.id;

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const record of valid) {
      // Find an existing row on the entity's natural key.
      let existingId: string | null = null;
      const keyParts = entity.duplicateKeys.filter((k) => record[k] !== undefined);
      if (keyParts.length) {
        const conditions: string[] = [];
        const params: unknown[] = [];
        for (const key of keyParts) {
          params.push(String(record[key]));
          conditions.push(
            key === 'email' || key === 'name'
              ? `lower(${key}::text) = lower($${params.length})`
              : `${key} = $${params.length}`,
          );
        }
        if (entity.companyScoped && companyId) {
          params.push(companyId);
          conditions.push(`company_id = $${params.length}`);
        }
        const found = await one<{ id: string }>(
          `select id from ${entity.table} where ${conditions.join(' and ')} limit 1`,
          params,
        );
        existingId = found?.id ?? null;
      }

      if (existingId && duplicateStrategy === 'skip') {
        skipped++;
        await sql(
          `insert into import_records (import_id, entity_type, entity_id, action)
           values ($1,$2,$3,'skipped')`,
          [importId, entityId, existingId],
        );
        continue;
      }

      const payload: Record<string, unknown> = { ...record };
      if (entity.companyScoped && companyId) payload.company_id = companyId;
      if (entity.table === 'investors') {
        const holding = await one<{ id: string }>(`select id from holdings order by created_at limit 1`);
        payload.holding_id = holding!.id;
        payload.pitching_company_id = companyId;
      }
      if (entity.table === 'parfax_users') payload.source = 'import';
      if (entity.table === 'invoices') {
        payload.source = 'import';
        const total = Number(payload.total ?? 0);
        const paid = Number(payload.amount_paid ?? 0);
        payload.subtotal = total;
        payload.amount_due = Math.max(0, total - paid);
      }

      const columns = Object.keys(payload);
      const values = Object.values(payload);

      if (existingId && duplicateStrategy === 'update') {
        const sets = columns.map((c, i) => `${c} = $${i + 2}`).join(',');
        await sql(`update ${entity.table} set ${sets} where id = $1`, [existingId, ...values]);
        updated++;
        await sql(
          `insert into import_records (import_id, entity_type, entity_id, action)
           values ($1,$2,$3,'updated')`,
          [importId, entityId, existingId],
        );
      } else {
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(',');
        const inserted = await one<{ id: string }>(
          `insert into ${entity.table} (${columns.join(',')}) values (${placeholders}) returning id`,
          values,
        );
        created++;
        await sql(
          `insert into import_records (import_id, entity_type, entity_id, action)
           values ($1,$2,$3,'created')`,
          [importId, entityId, inserted!.id],
        );

        // Keep the retrieval index in step for indexable entities.
        if (companyId && (entity.table === 'clients' || entity.table === 'investors')) {
          const title = String(payload.name ?? '');
          if (title) {
            await indexSource({
              companyId,
              sourceType: entity.table === 'clients' ? 'client' : 'investor',
              sourceId: inserted!.id,
              sourceTitle: title,
              sourceUrl: entity.table === 'clients' ? `/crm/clients/${inserted!.id}` : `/investors/${inserted!.id}`,
              content: Object.entries(payload)
                .filter(([k]) => !['company_id', 'holding_id', 'pitching_company_id'].includes(k))
                .map(([k, v]) => `${k}: ${String(v)}`)
                .join('\n'),
            });
          }
        }
      }
    }

    const failed = new Set(issues.map((i) => i.row)).size;
    await sql(
      `update imports set status = 'complete', created_count = $2, updated_count = $3,
         skipped_count = $4, failed_count = $5
       where id = $1`,
      [importId, created, updated, skipped, failed],
    );

    await recordAudit({
      actor, companyId, action: 'import.run',
      entityType: entityId, entityId: importId, entityLabel: filename,
      severity: 'notice',
      after: { created, updated, skipped, failed, total: rows.length, strategy: duplicateStrategy },
    });
    await recordActivity({
      actor, companyId, entityType: 'import', entityId: importId,
      action: 'imported',
      summary: `Imported ${created + updated} ${entity.label.toLowerCase()} from ${filename}`,
    });

    revalidatePath('/settings/import');
    revalidatePath('/', 'layout');
    return { ok: true, data: { importId, created, updated, skipped, failed, issues: issues.slice(0, 100) } };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Rolls an import back by deleting the rows it created. Rows it *updated* are
 * left alone — the previous values were not snapshotted, so silently reverting
 * them would be a guess. The UI says so.
 */
export async function rollbackImportAction(importId: string, reason: string): Promise<ActionResult<{ removed: number; keptUpdates: number }>> {
  try {
    if (reason.trim().length < 4) return { ok: false, error: 'Give a short reason.' };
    const record = await one<{
      company_id: string | null; entity_type: string; filename: string; rolled_back_at: Date | null;
    }>(`select company_id, entity_type, filename, rolled_back_at from imports where id = $1`, [importId]);
    if (!record) return { ok: false, error: 'Import not found.' };
    if (record.rolled_back_at) return { ok: false, error: 'This import has already been rolled back.' };

    const entity = getImportEntity(record.entity_type);
    if (!entity) return { ok: false, error: 'Unknown import type.' };

    const actor = record.company_id ? await requireCompanyAccess(record.company_id) : await requireActor();
    if (!actor.can(entity.permission, record.company_id)) {
      throw new ForbiddenError(entity.permission, record.company_id);
    }

    const createdRows = await sql<{ entity_id: string }>(
      `select entity_id from import_records where import_id = $1 and action = 'created'`,
      [importId],
    );
    const updatedRows = await sql<{ entity_id: string }>(
      `select entity_id from import_records where import_id = $1 and action = 'updated'`,
      [importId],
    );

    let removed = 0;
    for (const row of createdRows) {
      await sql(`delete from ${entity.table} where id = $1`, [row.entity_id]);
      if (entity.table === 'clients') await removeFromIndex('client', row.entity_id);
      if (entity.table === 'investors') await removeFromIndex('investor', row.entity_id);
      removed++;
    }

    await sql(`update imports set status = 'rolled_back', rolled_back_at = now() where id = $1`, [importId]);
    await recordAudit({
      actor, companyId: record.company_id, action: 'import.rolled_back',
      entityType: record.entity_type, entityId: importId, entityLabel: record.filename,
      reason, severity: 'warning',
      after: { removed, kept_updates: updatedRows.length },
    });
    revalidatePath('/settings/import');
    return { ok: true, data: { removed, keptUpdates: updatedRows.length } };
  } catch (err) {
    return fail(err);
  }
}

export async function listImportsAction(companyIds: string[]) {
  await requireActor();
  return sql<{
    id: string; entity_type: string; filename: string; status: string;
    total_rows: number; created_count: number; updated_count: number;
    skipped_count: number; failed_count: number; rolled_back_at: Date | null;
    created_at: Date; created_by: string | null; company_name: string | null;
  }>(
    `select i.id, i.entity_type, i.filename, i.status, i.total_rows, i.created_count,
            i.updated_count, i.skipped_count, i.failed_count, i.rolled_back_at, i.created_at,
            u.name as created_by, co.name as company_name
     from imports i
     left join users u on u.id = i.created_by_id
     left join companies co on co.id = i.company_id
     where i.company_id is null or i.company_id = any($1)
     order by i.created_at desc limit 50`,
    [companyIds],
  );
}
