import { NextResponse, type NextRequest } from 'next/server';
import { getActor } from '@/lib/auth/actor';
import { allowedAccessLevels, getDocument } from '@/lib/queries/knowledge';
import { getStorage } from '@/lib/storage';
import { recordAudit } from '@/lib/audit';

/**
 * Authorized file download.
 *
 * Files are never served from a public object URL: every read goes through
 * this route, which re-checks company access and the document's access level,
 * then records the access in the audit log.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const doc = await getDocument(id);
  if (!doc || doc.kind !== 'file' || !doc.storage_key) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  if (!actor.canReadCompany(doc.company_id) || !actor.can('knowledge:read', doc.company_id)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
  const levels = allowedAccessLevels({
    restricted: actor.can('knowledge:restricted_read', doc.company_id),
    finance: actor.can('finance:read', doc.company_id),
    investor: actor.can('investor:read', doc.company_id),
    hr: actor.can('team:compensation_read', doc.company_id),
  });
  if (!levels.includes(doc.access_level)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  let data: Buffer;
  try {
    data = await getStorage().get(doc.storage_key);
  } catch {
    return NextResponse.json(
      { error: 'The stored file could not be read. It may have been removed from storage.' },
      { status: 410 },
    );
  }

  await recordAudit({
    actor,
    companyId: doc.company_id,
    action: 'document.downloaded',
    entityType: 'document',
    entityId: id,
    entityLabel: doc.name,
    severity: doc.access_level === 'company' ? 'info' : 'notice',
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: request.headers.get('user-agent'),
  });

  // ASCII fallback plus RFC 5987 form, so non-Latin names survive the header.
  const ascii = doc.name.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': doc.mime_type ?? 'application/octet-stream',
      'Content-Length': String(data.byteLength),
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
