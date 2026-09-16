import { sql } from '@/lib/db/client';
import type { AiSource } from '@/lib/ai/provider';

export interface RetrievedChunk {
  id: string;
  company_id: string;
  company_name: string | null;
  source_type: string;
  source_id: string;
  source_title: string;
  source_url: string | null;
  chunk_index: number;
  content: string;
  is_demo: boolean;
  rank: number;
}

/** Turns free text into a Postgres websearch query, safely parameterised. */
function toQuery(question: string) {
  return question.replace(/[^\p{L}\p{N}\s'"-]/gu, ' ').trim();
}

/**
 * Company-scoped full-text retrieval.
 *
 * `companyIds` is always required and always applied, so the tenant boundary
 * is enforced in the query itself rather than filtered afterwards.
 */
export async function retrieve(opts: {
  question: string;
  companyIds: string[];
  limit?: number;
  sourceTypes?: string[];
}): Promise<RetrievedChunk[]> {
  const query = toQuery(opts.question);
  if (!query || !opts.companyIds.length) return [];

  const params: unknown[] = [query, opts.companyIds];
  let typeFilter = '';
  if (opts.sourceTypes?.length) {
    params.push(opts.sourceTypes);
    typeFilter = `and k.source_type = any($${params.length})`;
  }
  const limit = Math.min(opts.limit ?? 12, 40);

  const rows = await sql<RetrievedChunk>(
    `select k.id, k.company_id, c.name as company_name, k.source_type, k.source_id,
            k.source_title, k.source_url, k.chunk_index, k.content, k.is_demo,
            ts_rank(k.tsv, websearch_to_tsquery('english', $1)) as rank
     from knowledge_chunks k
     left join companies c on c.id = k.company_id
     where k.company_id = any($2)
       ${typeFilter}
       and k.tsv @@ websearch_to_tsquery('english', $1)
     order by rank desc, k.source_type, k.chunk_index
     limit ${limit}`,
    params,
  );

  if (rows.length) return rows;

  // Fall back to a trigram-free ILIKE pass so a single distinctive term (a
  // company name, say) still finds its records when stemming misses.
  const words = query.split(/\s+/).filter((w) => w.length > 3).slice(0, 4);
  if (!words.length) return [];
  const likeParams: unknown[] = [opts.companyIds];
  const clauses = words.map((w) => {
    likeParams.push(`%${w}%`);
    return `(k.content ilike $${likeParams.length} or k.source_title ilike $${likeParams.length})`;
  });
  return sql<RetrievedChunk>(
    `select k.id, k.company_id, c.name as company_name, k.source_type, k.source_id,
            k.source_title, k.source_url, k.chunk_index, k.content, k.is_demo, 0.01 as rank
     from knowledge_chunks k
     left join companies c on c.id = k.company_id
     where k.company_id = any($1) and (${clauses.join(' or ')})
     limit ${limit}`,
    likeParams,
  );
}

/** Collapses chunks to one entry per source, keeping the best-ranked text. */
export function chunksToSources(chunks: RetrievedChunk[], maxSources = 8): AiSource[] {
  const bySource = new Map<string, { chunk: RetrievedChunk; parts: string[] }>();
  for (const chunk of chunks) {
    const key = `${chunk.source_type}:${chunk.source_id}`;
    const entry = bySource.get(key);
    if (entry) {
      if (entry.parts.length < 3) entry.parts.push(chunk.content);
    } else {
      bySource.set(key, { chunk, parts: [chunk.content] });
    }
  }
  return [...bySource.values()].slice(0, maxSources).map(({ chunk, parts }) => ({
    sourceType: chunk.source_type,
    sourceId: chunk.source_id,
    title: chunk.source_title,
    href: chunk.source_url,
    content: parts.join('\n\n'),
  }));
}
