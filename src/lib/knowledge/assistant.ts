import { getAiProvider, type AiAnswer } from '@/lib/ai/provider';
import { retrieve, chunksToSources } from './retrieval';

export interface AssistantResult extends AiAnswer {
  sourcesConsidered: number;
  companiesSearched: number;
  /** True when any cited source is demo data, so the UI can say so. */
  includesDemoData: boolean;
}

/**
 * Answers a natural-language question strictly from records the caller can
 * read. `companyIds` must already be filtered to the caller's access — this
 * function does not widen it, and passing an empty list returns no answer.
 */
export async function askKnowledge(opts: {
  question: string;
  companyIds: string[];
  sourceTypes?: string[];
}): Promise<AssistantResult> {
  const provider = getAiProvider();

  if (!opts.companyIds.length) {
    return {
      answer: 'You do not have access to any company records, so there is nothing to search.',
      citations: [],
      insufficient: true,
      provider: provider.id,
      model: provider.model,
      sourcesConsidered: 0,
      companiesSearched: 0,
      includesDemoData: false,
    };
  }

  const chunks = await retrieve({
    question: opts.question,
    companyIds: opts.companyIds,
    sourceTypes: opts.sourceTypes,
    limit: 16,
  });
  const sources = chunksToSources(chunks);
  const answer = await provider.answerQuestion({ question: opts.question, sources });

  return {
    ...answer,
    sourcesConsidered: sources.length,
    companiesSearched: opts.companyIds.length,
    includesDemoData: chunks.some((c) => c.is_demo),
  };
}

export const SUGGESTED_QUESTIONS = [
  'What did we last discuss with Troon?',
  'Which clients have unpaid invoices?',
  'What are the biggest ParFax launch risks?',
  'Which investors need follow-up this week?',
  'Summarise everything related to the 2nd Swing Golf partnership.',
  'What is our pricing for a growth retainer?',
  'Which accounts are at risk of churn and why?',
];
