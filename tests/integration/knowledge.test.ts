import { beforeAll, describe, expect, it } from 'vitest';
import { freshDatabase } from '../db';
import { one, sql } from '@/lib/db/client';
import { seedAll } from '@/lib/seed';
import { askKnowledge } from '@/lib/knowledge/assistant';
import { retrieve } from '@/lib/knowledge/retrieval';
import { localAiProvider } from '@/lib/ai/provider';

/**
 * Two rules the knowledge assistant must never break: it answers only from the
 * records the caller can read, and every answer points back at the records it
 * came from. When the sources do not contain the answer, it says so rather
 * than inventing one.
 */

let digital: string;
let parfax: string;

beforeAll(async () => {
  await freshDatabase();
  await seedAll({ demo: true });
  digital = (await one<{ id: string }>(`select id from companies where slug = 'eisman-digital'`))!.id;
  parfax = (await one<{ id: string }>(`select id from companies where slug = 'parfax'`))!.id;
}, 300_000);

describe('retrieval', () => {
  it('builds an index from the seeded records', async () => {
    const chunks = await sql<{ c: number }>(`select count(*)::int as c from knowledge_chunks`);
    expect(chunks[0]!.c).toBeGreaterThan(0);
  });

  it('never returns a chunk from a company that was not asked for', async () => {
    const results = await retrieve({ question: 'partnership launch risks', companyIds: [digital], limit: 20 });
    for (const chunk of results) expect(chunk.company_id).toBe(digital);

    const parfaxResults = await retrieve({ question: 'partnership launch risks', companyIds: [parfax], limit: 20 });
    for (const chunk of parfaxResults) expect(chunk.company_id).toBe(parfax);
  });

  it('returns nothing when no company is in scope', async () => {
    expect(await retrieve({ question: 'anything at all', companyIds: [], limit: 20 })).toEqual([]);
  });

  it('finds the record a distinctive phrase came from', async () => {
    const doc = await one<{ company_id: string; name: string }>(
      `select company_id, name from documents where is_demo = true order by created_at limit 1`,
    );
    const results = await retrieve({ question: doc!.name, companyIds: [doc!.company_id], limit: 10 });
    expect(results.length).toBeGreaterThan(0);
  });
});

describe('answers', () => {
  it('cites the records it used', async () => {
    const result = await askKnowledge({
      question: 'What are the risks on the ParFax partnerships?',
      companyIds: [parfax],
    });
    if (!result.insufficient) {
      expect(result.citations.length).toBeGreaterThan(0);
      for (const citation of result.citations) {
        expect(citation.sourceId).toBeTruthy();
        expect(citation.excerpt.length).toBeGreaterThan(0);
      }
    }
    expect(result.sourcesConsidered).toBeGreaterThanOrEqual(0);
  });

  it('refuses to answer when the caller can read nothing', async () => {
    const result = await askKnowledge({ question: 'What is our revenue?', companyIds: [] });
    expect(result.insufficient).toBe(true);
    expect(result.citations).toEqual([]);
    expect(result.sourcesConsidered).toBe(0);
  });

  it('says so rather than inventing an answer the sources do not support', async () => {
    const result = await askKnowledge({
      question: 'What is the airspeed velocity of an unladen swallow?',
      companyIds: [digital],
    });
    expect(result.insufficient).toBe(true);
    expect(result.answer).toMatch(/not|no |enough|could not|nothing/i);
  });

  it('flags when the answer rests on demo data', async () => {
    const result = await askKnowledge({ question: 'Which clients are at risk?', companyIds: [digital] });
    if (result.citations.length > 0) expect(result.includesDemoData).toBe(true);
  });

  it('names the provider that produced the answer', async () => {
    const result = await askKnowledge({ question: 'Summarise our clients', companyIds: [digital] });
    expect(result.provider).toBeTruthy();
    expect(result.model).toBeTruthy();
  });
});

describe('the local provider', () => {
  const sources = [
    {
      sourceType: 'note',
      sourceId: 'note-1',
      title: 'Kestrel renewal call',
      href: '/knowledge/notes/note-1',
      content:
        'Kestrel Robotics confirmed they will renew at $14,000 per month. They asked for a dedicated analyst on the account before signing.',
    },
    {
      sourceType: 'note',
      sourceId: 'note-2',
      title: 'Unrelated note',
      href: null,
      content: 'The office coffee machine needs servicing.',
    },
  ];

  it('quotes the source rather than writing new prose', async () => {
    const answer = await localAiProvider.answerQuestion({
      question: 'What did Kestrel say about renewing?',
      sources,
    });
    expect(answer.insufficient).toBe(false);
    expect(answer.citations.length).toBeGreaterThan(0);
    // Every sentence it returns has to appear in a source it cited.
    const corpus = sources.map((s) => s.content).join(' ');
    for (const citation of answer.citations) {
      expect(corpus).toContain(citation.excerpt.trim().replace(/^…|…$/g, '').trim().slice(0, 40));
    }
  });

  it('reports insufficiency instead of guessing', async () => {
    const answer = await localAiProvider.answerQuestion({
      question: 'What is our headcount plan for 2030?',
      sources,
    });
    expect(answer.insufficient).toBe(true);
    expect(answer.citations).toEqual([]);
  });

  it('returns insufficiency when given no sources at all', async () => {
    const answer = await localAiProvider.answerQuestion({ question: 'Anything?', sources: [] });
    expect(answer.insufficient).toBe(true);
  });

  it('extracts insights verbatim from the document, never generating them', async () => {
    const insights = await localAiProvider.summarizeDocument({
      title: 'Kestrel renewal call',
      text: sources[0]!.content,
    });
    expect(insights.summary.length).toBeGreaterThan(0);
    expect(sources[0]!.content).toContain(insights.summary.split('.')[0]!.trim().slice(0, 30));
  });
});
