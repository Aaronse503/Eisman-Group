'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireActor, requireCompanyAccess, ForbiddenError } from '@/lib/auth/actor';
import {
  disconnect, ensureConnection, getConnection, runSync, saveCredentials, setMode,
  setWriteEnabled, testConnection,
} from '@/lib/integrations/manager';
import { getAdapter } from '@/lib/integrations/adapters';
import { getProvider, type ProviderId } from '@/lib/integrations/registry';
import { sql } from '@/lib/db/client';
import type { ActionResult } from '@/lib/validation/schemas';

function fail(err: unknown): ActionResult<never> {
  if (err instanceof ForbiddenError) {
    return { ok: false, error: 'You do not have permission to manage integrations here.' };
  }
  return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' };
}

/** Integrations are configured by Company Admins (or the Holdings Owner). */
async function requireIntegrationWrite(connectionId: string) {
  const connection = await getConnection(connectionId);
  if (!connection) throw new Error('Connection not found.');
  const actor = connection.company_id
    ? await requireCompanyAccess(connection.company_id)
    : await requireActor();
  if (!actor.can('integration:write', connection.company_id)) {
    throw new ForbiddenError('integration:write', connection.company_id);
  }
  return { actor, connection };
}

export async function saveCredentialsAction(
  connectionId: string,
  credentials: Record<string, string>,
): Promise<ActionResult<null>> {
  try {
    const { actor } = await requireIntegrationWrite(connectionId);
    await saveCredentials({ connectionId, credentials, actor });
    revalidatePath('/integrations');
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function testConnectionAction(connectionId: string) {
  try {
    const { actor } = await requireIntegrationWrite(connectionId);
    const result = await testConnection(connectionId, actor);
    revalidatePath('/integrations');
    return { ok: true as const, data: result };
  } catch (err) {
    return fail(err);
  }
}

export async function setModeAction(
  connectionId: string,
  mode: 'demo' | 'disconnected',
): Promise<ActionResult<null>> {
  try {
    const { actor } = await requireIntegrationWrite(connectionId);
    await setMode(connectionId, mode, actor);
    revalidatePath('/integrations');
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function disconnectAction(connectionId: string): Promise<ActionResult<null>> {
  try {
    const { actor } = await requireIntegrationWrite(connectionId);
    await disconnect(connectionId, actor);
    revalidatePath('/integrations');
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function syncNowAction(connectionId: string) {
  try {
    const { actor } = await requireIntegrationWrite(connectionId);
    const result = await runSync({ connectionId, trigger: 'manual', actor });
    revalidatePath('/integrations');
    revalidatePath('/', 'layout');
    return {
      ok: true as const,
      data: {
        status: result.status,
        recordsRead: result.recordsRead,
        recordsWritten: result.recordsWritten,
        conflicts: result.conflicts,
        warnings: result.warnings ?? [],
      },
    };
  } catch (err) {
    return fail(err);
  }
}

const writebackSchema = z.object({
  connectionId: z.string().uuid(),
  enabled: z.boolean(),
  reason: z.string().trim().min(10, 'Explain why write-back is being enabled — this is audited.'),
});

export async function setWriteBackAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const parsed = writebackSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
    }
    const { actor, connection } = await requireIntegrationWrite(parsed.data.connectionId);
    if (!actor.can('integration:enable_writeback', connection.company_id)) {
      return {
        ok: false,
        error: 'Enabling write-back requires the Holdings Owner or a Company Admin.',
      };
    }
    await setWriteEnabled(parsed.data.connectionId, parsed.data.enabled, parsed.data.reason, actor);
    revalidatePath('/integrations');
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function ensureConnectionAction(
  provider: string,
  companyId: string | null,
): Promise<ActionResult<{ id: string }>> {
  try {
    const def = getProvider(provider);
    if (!def) return { ok: false, error: 'Unknown provider.' };
    const actor = companyId ? await requireCompanyAccess(companyId) : await requireActor();
    if (!actor.can('integration:write', companyId)) {
      return { ok: false, error: 'You do not have permission to add an integration here.' };
    }
    const connection = await ensureConnection(provider as ProviderId, companyId);
    revalidatePath('/integrations');
    return { ok: true, data: { id: connection!.id } };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Produces the field-mapping proposal for a connector, for review before any
 * data is trusted. Nothing is applied by generating it.
 */
export async function proposeFieldMappingsAction(connectionId: string) {
  try {
    const { connection } = await requireIntegrationWrite(connectionId);
    const adapter = getAdapter(connection.provider);
    if (!adapter?.proposeFieldMappings) {
      return { ok: false as const, error: 'This connector does not publish a field map.' };
    }
    const proposals = await adapter.proposeFieldMappings({
      connection,
      credentials: {},
      companyId: connection.company_id,
      demo: connection.mode === 'demo',
      log: () => undefined,
    });
    for (const p of proposals) {
      await sql(
        `insert into field_mappings
           (connection_id, entity_type, source_field, target_field, source_of_truth)
         values ($1,$2,$3,$4,$5)
         on conflict (connection_id, entity_type, source_field) do update
           set target_field = excluded.target_field, source_of_truth = excluded.source_of_truth`,
        [connectionId, p.entityType, p.sourceField, p.targetField, p.sourceOfTruth],
      );
    }
    revalidatePath('/integrations');
    return { ok: true as const, data: proposals };
  } catch (err) {
    return fail(err);
  }
}

export async function approveFieldMappingsAction(connectionId: string): Promise<ActionResult<null>> {
  try {
    const { actor } = await requireIntegrationWrite(connectionId);
    await sql(
      `update field_mappings set approved = true, approved_by_id = $2, approved_at = now()
       where connection_id = $1`,
      [connectionId, actor.user.id],
    );
    revalidatePath('/integrations');
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}
