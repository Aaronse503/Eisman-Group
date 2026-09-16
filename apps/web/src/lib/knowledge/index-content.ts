import { sql } from '@/lib/db/client';

/**
 * Builds the retrieval corpus.
 *
 * Every chunk carries its company id and a citation back to the record it came
 * from. Retrieval filters on company id, so a question asked in one company's
 * workspace can never surface another company's material.
 */

const CHUNK_CHARS = 1400;
const CHUNK_OVERLAP = 180;

export function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  if (clean.length <= CHUNK_CHARS) return clean ? [clean] : [];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + CHUNK_CHARS, clean.length);
    if (end < clean.length) {
      // Prefer a paragraph or sentence boundary so chunks read cleanly.
      const window = clean.slice(start, end);
      const breakAt = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('. '));
      if (breakAt > CHUNK_CHARS * 0.5) end = start + breakAt + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks.filter(Boolean);
}

export async function indexSource(opts: {
  companyId: string;
  sourceType: string;
  sourceId: string;
  sourceTitle: string;
  sourceUrl: string | null;
  content: string;
  metadata?: Record<string, unknown>;
  isDemo?: boolean;
}) {
  await sql(`delete from knowledge_chunks where source_type = $1 and source_id = $2`, [
    opts.sourceType,
    opts.sourceId,
  ]);
  const chunks = chunkText(opts.content);
  for (const [i, content] of chunks.entries()) {
    await sql(
      `insert into knowledge_chunks
         (company_id, source_type, source_id, source_title, source_url, chunk_index, content, metadata, is_demo)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (source_type, source_id, chunk_index) do update
         set content = excluded.content, source_title = excluded.source_title,
             source_url = excluded.source_url, metadata = excluded.metadata,
             updated_at = now()`,
      [
        opts.companyId,
        opts.sourceType,
        opts.sourceId,
        opts.sourceTitle,
        opts.sourceUrl,
        i,
        content,
        JSON.stringify(opts.metadata ?? {}),
        opts.isDemo ?? false,
      ],
    );
  }
  return chunks.length;
}

export async function removeFromIndex(sourceType: string, sourceId: string) {
  await sql(`delete from knowledge_chunks where source_type = $1 and source_id = $2`, [
    sourceType,
    sourceId,
  ]);
}

/**
 * Rebuilds the corpus for one company from documents, notes, meetings and the
 * narrative fields on clients, partnerships and investors.
 */
export async function reindexCompany(companyId: string) {
  let count = 0;

  const documents = await sql<{
    id: string; name: string; summary: string | null; extracted_text: string | null;
    description: string | null; is_demo: boolean;
  }>(
    `select id, name, summary, extracted_text, description, is_demo
     from documents where company_id = $1 and deleted_at is null and is_current = true`,
    [companyId],
  );
  for (const doc of documents) {
    const body = [doc.summary, doc.description, doc.extracted_text].filter(Boolean).join('\n\n');
    if (!body.trim()) continue;
    count += await indexSource({
      companyId,
      sourceType: 'document',
      sourceId: doc.id,
      sourceTitle: doc.name,
      sourceUrl: `/knowledge/documents/${doc.id}`,
      content: body,
      isDemo: doc.is_demo,
    });
  }

  const notes = await sql<{ id: string; title: string; body: string; is_demo: boolean }>(
    `select id, title, body, is_demo from notes where company_id = $1 and deleted_at is null`,
    [companyId],
  );
  for (const note of notes) {
    if (!note.body.trim()) continue;
    count += await indexSource({
      companyId,
      sourceType: 'note',
      sourceId: note.id,
      sourceTitle: note.title,
      sourceUrl: `/knowledge/notes/${note.id}`,
      content: `${note.title}\n\n${note.body}`,
      isDemo: note.is_demo,
    });
  }

  const meetings = await sql<{
    id: string; title: string; agenda: string | null; notes: string | null;
    decisions: string | null; starts_at: Date; is_demo: boolean;
  }>(
    `select id, title, agenda, notes, decisions, starts_at, is_demo
     from meetings where company_id = $1 and deleted_at is null
       and (notes is not null or decisions is not null or agenda is not null)`,
    [companyId],
  );
  for (const m of meetings) {
    const body = [
      `Meeting: ${m.title} on ${new Date(m.starts_at).toISOString().slice(0, 10)}`,
      m.agenda ? `Agenda: ${m.agenda}` : '',
      m.notes ? `Notes: ${m.notes}` : '',
      m.decisions ? `Decisions: ${m.decisions}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    count += await indexSource({
      companyId,
      sourceType: 'meeting',
      sourceId: m.id,
      sourceTitle: m.title,
      sourceUrl: `/calendar/${m.id}`,
      content: body,
      isDemo: m.is_demo,
    });
  }

  const clients = await sql<{
    id: string; name: string; goals: string | null; deliverables: string | null;
    kpis: string | null; risks: string | null; next_action: string | null;
    status: string; health_score: number; is_demo: boolean;
  }>(
    `select id, name, goals, deliverables, kpis, risks, next_action, status, health_score, is_demo
     from clients where company_id = $1 and deleted_at is null`,
    [companyId],
  );
  for (const c of clients) {
    const body = [
      `Client: ${c.name}. Status: ${c.status}. Health score: ${c.health_score}.`,
      c.goals ? `Goals: ${c.goals}` : '',
      c.deliverables ? `Deliverables: ${c.deliverables}` : '',
      c.kpis ? `KPIs: ${c.kpis}` : '',
      c.risks ? `Risks: ${c.risks}` : '',
      c.next_action ? `Next action: ${c.next_action}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    count += await indexSource({
      companyId,
      sourceType: 'client',
      sourceId: c.id,
      sourceTitle: c.name,
      sourceUrl: `/crm/clients/${c.id}`,
      content: body,
      isDemo: c.is_demo,
    });
  }

  const partnerships = await sql<{
    id: string; name: string; category: string; stage: string; notes: string | null;
    next_action: string | null; revenue_share: string | null; pilot_location: string | null;
    equipment_requirements: string | null; contract_status: string; is_demo: boolean;
  }>(
    `select id, name, category, stage, notes, next_action, revenue_share, pilot_location,
            equipment_requirements, contract_status, is_demo
     from partnerships where company_id = $1 and deleted_at is null`,
    [companyId],
  );
  for (const p of partnerships) {
    const body = [
      `Partnership: ${p.name}. Category: ${p.category}. Stage: ${p.stage}. Contract status: ${p.contract_status}.`,
      p.revenue_share ? `Revenue share: ${p.revenue_share}` : '',
      p.pilot_location ? `Pilot location: ${p.pilot_location}` : '',
      p.equipment_requirements ? `Equipment: ${p.equipment_requirements}` : '',
      p.next_action ? `Next action: ${p.next_action}` : '',
      p.notes ?? '',
    ]
      .filter(Boolean)
      .join('\n');
    count += await indexSource({
      companyId,
      sourceType: 'partnership',
      sourceId: p.id,
      sourceTitle: p.name,
      sourceUrl: `/partnerships/${p.id}`,
      content: body,
      isDemo: p.is_demo,
    });
  }

  // Investors are holding-level; index them against the company being pitched.
  const investors = await sql<{
    id: string; name: string; pipeline_stage: string; notes: string | null;
    objections: string | null; requested_materials: string | null;
    warm_intro_source: string | null; investor_type: string; is_demo: boolean;
  }>(
    `select id, name, pipeline_stage, notes, objections, requested_materials,
            warm_intro_source, investor_type, is_demo
     from investors where pitching_company_id = $1 and deleted_at is null`,
    [companyId],
  );
  for (const inv of investors) {
    const body = [
      `Investor: ${inv.name}. Type: ${inv.investor_type}. Pipeline stage: ${inv.pipeline_stage}.`,
      inv.warm_intro_source ? `Warm intro: ${inv.warm_intro_source}` : '',
      inv.objections ? `Objections: ${inv.objections}` : '',
      inv.requested_materials ? `Requested materials: ${inv.requested_materials}` : '',
      inv.notes ?? '',
    ]
      .filter(Boolean)
      .join('\n');
    count += await indexSource({
      companyId,
      sourceType: 'investor',
      sourceId: inv.id,
      sourceTitle: inv.name,
      sourceUrl: `/investors/${inv.id}`,
      content: body,
      isDemo: inv.is_demo,
    });
  }

  return count;
}
