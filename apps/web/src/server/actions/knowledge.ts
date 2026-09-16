'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sql, one } from '@/lib/db/client';
import { requireActor, requireCompanyAccess, ForbiddenError } from '@/lib/auth/actor';
import { recordActivity } from '@/lib/activity';
import { recordAudit } from '@/lib/audit';
import { indexSource, removeFromIndex } from '@/lib/knowledge/index-content';
import { extractText } from '@/lib/knowledge/extract';
import { getAiProvider } from '@/lib/ai/provider';
import { askKnowledge } from '@/lib/knowledge/assistant';
import { buildKey, getStorage, isAllowedMime, MAX_UPLOAD_BYTES } from '@/lib/storage';
import { allowedAccessLevels } from '@/lib/queries/knowledge';
import type { ActionResult } from '@/lib/validation/schemas';
import { rethrowControlFlow } from '@/lib/action-errors';

function fail(err: unknown): ActionResult<never> {
  rethrowControlFlow(err);
  if (err instanceof ForbiddenError) {
    return { ok: false, error: 'You do not have permission to do that here.' };
  }
  return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' };
}

async function requireKnowledgeWrite(companyId: string) {
  const actor = await requireCompanyAccess(companyId);
  if (!actor.can('knowledge:write', companyId)) throw new ForbiddenError('knowledge:write', companyId);
  return actor;
}

export interface UploadResult {
  id: string;
  name: string;
  textStatus: string;
  aiStatus: string;
  summary: string | null;
  warning: string | null;
}

/**
 * Handles an upload end to end: store the bytes, extract the text, summarise
 * it with the active AI provider, index it for retrieval, and link it to the
 * record it was uploaded from.
 *
 * Every stage degrades independently — a file whose text cannot be read is
 * still stored and downloadable, and says plainly why it is not searchable.
 */
export async function uploadDocumentAction(formData: FormData): Promise<ActionResult<UploadResult>> {
  try {
    const companyId = String(formData.get('companyId') ?? '');
    const file = formData.get('file');
    if (!companyId) return { ok: false, error: 'Choose a company.' };
    if (!(file instanceof File)) return { ok: false, error: 'Choose a file to upload.' };

    const actor = await requireKnowledgeWrite(companyId);

    if (file.size === 0) return { ok: false, error: 'That file is empty.' };
    if (file.size > MAX_UPLOAD_BYTES) {
      return {
        ok: false,
        error: `Files must be ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB or smaller. That one is ${(file.size / 1024 / 1024).toFixed(1)}MB.`,
      };
    }
    const mimeType = file.type || 'application/octet-stream';
    if (!isAllowedMime(mimeType)) {
      return { ok: false, error: `${mimeType} files are not accepted.` };
    }

    const accessLevel = String(formData.get('accessLevel') ?? 'company');
    if (!['company', 'finance', 'investor', 'hr', 'restricted'].includes(accessLevel)) {
      return { ok: false, error: 'Invalid access level.' };
    }
    if (accessLevel === 'restricted' && !actor.can('knowledge:restricted_read', companyId)) {
      return { ok: false, error: 'Only a Company Admin can mark a document as restricted.' };
    }

    const folderId = String(formData.get('folderId') ?? '') || null;
    const description = String(formData.get('description') ?? '') || null;
    const entityType = String(formData.get('entityType') ?? '') || null;
    const entityId = String(formData.get('entityId') ?? '') || null;
    const replacesId = String(formData.get('replacesId') ?? '') || null;

    const data = Buffer.from(await file.arrayBuffer());
    const storage = getStorage();
    const key = buildKey(companyId, file.name);
    const stored = await storage.put(key, data, mimeType);

    // Versioning: replacing a document keeps the same version group.
    let versionGroup: string | null = null;
    let version = 1;
    if (replacesId) {
      const previous = await one<{ version_group: string; version: number; company_id: string }>(
        `select version_group, version, company_id from documents where id = $1 and deleted_at is null`,
        [replacesId],
      );
      if (previous && previous.company_id === companyId) {
        versionGroup = previous.version_group;
        version = previous.version + 1;
        await sql(`update documents set is_current = false where version_group = $1`, [versionGroup]);
      }
    }

    const extraction = await extractText(data, mimeType, file.name);

    const inserted = await one<{ id: string }>(
      `insert into documents
         (company_id, folder_id, name, description, mime_type, byte_size, storage_driver,
          storage_key, checksum, uploaded_by_id, access_level, text_status, extracted_text,
          text_error, page_count, version, is_current, version_group)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true,
               coalesce($17::uuid, gen_random_uuid()))
       returning id`,
      [
        companyId, folderId, file.name, description, mimeType, stored.size, stored.driver,
        stored.key, stored.checksum, actor.user.id, accessLevel, extraction.status,
        extraction.text, extraction.error, extraction.pageCount, version, versionGroup,
      ],
    );
    const documentId = inserted!.id;

    if (entityType && entityId) {
      await sql(
        `insert into document_links (document_id, entity_type, entity_id) values ($1,$2,$3)
         on conflict do nothing`,
        [documentId, entityType, entityId],
      );
    }

    let summary: string | null = null;
    let aiStatus = 'skipped';
    if (extraction.status === 'extracted' && extraction.text) {
      const provider = getAiProvider();
      try {
        const insights = await provider.summarizeDocument({ title: file.name, text: extraction.text });
        summary = insights.summary;
        aiStatus = 'ready';
        await sql(
          `update documents set ai_status = 'ready', ai_provider = $2, ai_model = $3,
             ai_generated_at = now(), summary = $4, key_points = $5,
             extracted_action_items = $6, extracted_people = $7, extracted_orgs = $8,
             extracted_dates = $9
           where id = $1`,
          [
            documentId, insights.provider, insights.model, insights.summary,
            JSON.stringify(insights.keyPoints), JSON.stringify(insights.actionItems),
            JSON.stringify(insights.people), JSON.stringify(insights.organizations),
            JSON.stringify(insights.importantDates),
          ],
        );
      } catch (err) {
        aiStatus = 'failed';
        await sql(`update documents set ai_status = 'failed' where id = $1`, [documentId]);
        console.error('Document summarisation failed', err);
      }

      await indexSource({
        companyId,
        sourceType: 'document',
        sourceId: documentId,
        sourceTitle: file.name,
        sourceUrl: `/knowledge/documents/${documentId}`,
        content: [summary, description, extraction.text].filter(Boolean).join('\n\n'),
      });
    }

    await recordActivity({
      actor, companyId, entityType: 'document', entityId: documentId,
      action: 'uploaded', summary: `Uploaded ${file.name}`,
    });
    await recordAudit({
      actor, companyId, action: 'document.uploaded',
      entityType: 'document', entityId: documentId, entityLabel: file.name,
      severity: accessLevel === 'company' ? 'info' : 'notice',
      after: { access_level: accessLevel, size: stored.size, version },
    });

    revalidatePath('/knowledge');
    return {
      ok: true,
      data: {
        id: documentId,
        name: file.name,
        textStatus: extraction.status,
        aiStatus,
        summary,
        warning: extraction.error,
      },
    };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteDocumentAction(id: string, reason: string): Promise<ActionResult<null>> {
  try {
    if (reason.trim().length < 4) return { ok: false, error: 'Give a short reason.' };
    const doc = await one<{ company_id: string; name: string; access_level: string }>(
      `select company_id, name, access_level from documents where id = $1 and deleted_at is null`,
      [id],
    );
    if (!doc) return { ok: false, error: 'Document not found.' };
    const actor = await requireKnowledgeWrite(doc.company_id);

    // Soft delete: the file stays in storage so the action is reversible.
    await sql(`update documents set deleted_at = now() where id = $1`, [id]);
    await removeFromIndex('document', id);
    await recordAudit({
      actor, companyId: doc.company_id, action: 'document.deleted',
      entityType: 'document', entityId: id, entityLabel: doc.name,
      reason, severity: 'warning', before: { access_level: doc.access_level },
    });
    revalidatePath('/knowledge');
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function reindexDocumentAction(id: string): Promise<ActionResult<{ chunks: number }>> {
  try {
    const doc = await one<{
      company_id: string; name: string; summary: string | null;
      description: string | null; extracted_text: string | null;
    }>(
      `select company_id, name, summary, description, extracted_text
       from documents where id = $1 and deleted_at is null`,
      [id],
    );
    if (!doc) return { ok: false, error: 'Document not found.' };
    await requireKnowledgeWrite(doc.company_id);
    const body = [doc.summary, doc.description, doc.extracted_text].filter(Boolean).join('\n\n');
    if (!body.trim()) return { ok: false, error: 'There is no text to index for this document.' };
    const chunks = await indexSource({
      companyId: doc.company_id,
      sourceType: 'document',
      sourceId: id,
      sourceTitle: doc.name,
      sourceUrl: `/knowledge/documents/${id}`,
      content: body,
    });
    revalidatePath(`/knowledge/documents/${id}`);
    return { ok: true, data: { chunks } };
  } catch (err) {
    return fail(err);
  }
}

const askSchema = z.object({
  question: z.string().trim().min(4, 'Ask a fuller question.').max(600),
  companySlug: z.string().optional(),
});

export async function askKnowledgeAction(input: unknown) {
  const parsed = askSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid question.' };
  }
  const actor = await requireActor();

  // Only companies the caller can read are searched, and only those where
  // they hold the knowledge:read permission.
  let companyIds = actor.companies
    .filter((c) => actor.can('knowledge:read', c.id))
    .map((c) => c.id);
  if (parsed.data.companySlug && parsed.data.companySlug !== 'holdings') {
    const company = actor.companies.find((c) => c.slug === parsed.data.companySlug);
    companyIds = company && companyIds.includes(company.id) ? [company.id] : [];
  }

  const result = await askKnowledge({ question: parsed.data.question, companyIds });
  await recordActivity({
    actor,
    companyId: companyIds.length === 1 ? companyIds[0]! : null,
    entityType: 'knowledge',
    action: 'asked',
    summary: `Asked the knowledge assistant: “${parsed.data.question.slice(0, 120)}”`,
    meta: { citations: result.citations.length, insufficient: result.insufficient },
  });
  return { ok: true as const, data: result };
}

export async function createFolderAction(companyId: string, name: string): Promise<ActionResult<{ id: string }>> {
  try {
    if (name.trim().length < 2) return { ok: false, error: 'Give the folder a name.' };
    await requireKnowledgeWrite(companyId);
    const row = await one<{ id: string }>(
      `insert into folders (company_id, name) values ($1,$2) returning id`,
      [companyId, name.trim()],
    );
    revalidatePath('/knowledge');
    return { ok: true, data: { id: row!.id } };
  } catch (err) {
    return fail(err);
  }
}

/** Access levels the current actor may read in a given company. */
export async function accessLevelsFor(companyId: string | null) {
  const actor = await requireActor();
  return allowedAccessLevels({
    restricted: actor.can('knowledge:restricted_read', companyId),
    finance: actor.can('finance:read', companyId),
    investor: actor.can('investor:read', companyId),
    hr: actor.can('team:compensation_read', companyId),
  });
}
