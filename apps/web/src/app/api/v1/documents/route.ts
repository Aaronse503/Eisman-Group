import type { DocumentSummary } from '@eisman/shared';
import { authed, badRequest } from '@/lib/api/route';
import { apiScope } from '@/lib/api/scope';
import { sql } from '@/lib/db/client';
import { uploadDocumentAction } from '@/server/actions/knowledge';

/** Documents the caller can read, most recently changed first. */
export const GET = authed<{ items: DocumentSummary[] }>(async ({ actor, params }) => {
  const scope = await apiScope(actor, params);
  const rows = await sql<{
    id: string; name: string; summary: string | null; folder_name: string | null;
    byte_size: number | null; mime_type: string | null; updated_at: Date;
    text_status: string; is_demo: boolean;
  }>(
    `select d.id, d.name, d.summary, f.name as folder_name, d.byte_size, d.mime_type,
            d.updated_at, d.text_status, d.is_demo
     from documents d
     left join folders f on f.id = d.folder_id
     where d.company_id = any($1) and d.deleted_at is null and d.is_current
     order by d.updated_at desc
     limit $2`,
    [scope.companyIds, Math.min(Number(params.get('limit') ?? 50), 200)],
  );

  return {
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      summary: r.summary,
      folderName: r.folder_name,
      sizeBytes: r.byte_size,
      mimeType: r.mime_type,
      updatedAt: new Date(r.updated_at).toISOString(),
      textStatus: r.text_status,
      isDemo: r.is_demo,
    })),
  };
});

/**
 * Uploads a document — a photographed page, a PDF, a file from the device.
 *
 * The body is multipart, the same as the web upload form, and it runs through
 * the same action: the same size and type limits, the same text extraction,
 * and the same honest reporting when a scan has no text layer to read.
 */
export const POST = authed(async ({ request }) => {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw badRequest('Send the file as multipart form data.');
  }

  const result = await uploadDocumentAction(formData);
  if (!result.ok) throw badRequest(result.error);
  return result.data;
});
