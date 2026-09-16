import { getEnv } from '@/lib/env';

export interface AiCitation {
  /** Index into the supplied sources, 1-based, as rendered in the answer. */
  index: number;
  sourceType: string;
  sourceId: string;
  title: string;
  href: string | null;
  excerpt: string;
}

export interface AiSource {
  sourceType: string;
  sourceId: string;
  title: string;
  href: string | null;
  content: string;
}

export interface AiAnswer {
  answer: string;
  citations: AiCitation[];
  /** True when the sources did not contain enough to answer. */
  insufficient: boolean;
  provider: string;
  model: string;
}

export interface AiDocumentInsights {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  people: string[];
  organizations: string[];
  importantDates: string[];
  provider: string;
  model: string;
}

export interface AiProvider {
  readonly id: string;
  readonly model: string;
  readonly generative: boolean;
  summarizeDocument(input: { title: string; text: string }): Promise<AiDocumentInsights>;
  answerQuestion(input: { question: string; sources: AiSource[] }): Promise<AiAnswer>;
}

// --------------------------------------------------------------------------
// Local provider — no network, no generated prose.
//
// Everything it returns is extracted verbatim from the source text, so it can
// never invent a fact. It is the default when no Anthropic key is configured.
// --------------------------------------------------------------------------

const STOP_WORDS = new Set(
  `a about above after again against all am an and any are aren't as at be because been before being below between both but by can cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't have haven't having he her here hers herself him himself his how i if in into is isn't it its itself let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves out over own same shan't she should shouldn't so some such than that the their theirs them themselves then there these they this those through to too under until up very was wasn't we were weren't what when where which while who whom why with won't would wouldn't you your yours yourself yourselves will shall may might must also upon within per`.split(
    /\s+/,
  ),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s$%.-]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, ''))
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25);
}

/** Frequency-weighted extractive ranking: classic, deterministic, honest. */
function rankSentences(sentences: string[], queryTokens?: string[]): { sentence: string; score: number; index: number }[] {
  const freq = new Map<string, number>();
  for (const s of sentences) {
    for (const t of tokenize(s)) freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  const querySet = new Set(queryTokens ?? []);
  return sentences
    .map((sentence, index) => {
      const tokens = tokenize(sentence);
      if (!tokens.length) return { sentence, score: 0, index };
      let score = tokens.reduce((acc, t) => acc + (freq.get(t) ?? 0), 0) / Math.sqrt(tokens.length);
      if (querySet.size) {
        const overlap = tokens.filter((t) => querySet.has(t)).length;
        score = score * 0.25 + overlap * 12;
      }
      // Lead sentences usually carry the thesis.
      if (index < 3) score *= 1.15;
      return { sentence, score, index };
    })
    .sort((a, b) => b.score - a.score);
}

const CAPITALISED = /\b([A-Z][\w'’-]+(?:\s+(?:&|and|of|the|for)?\s*[A-Z][\w'’-]+){0,3})\b/g;
const ORG_SUFFIX = /\b(Inc|LLC|Ltd|Corp|Corporation|Company|Partners|Group|Ventures|Capital|Holdings|Fund|Golf|Studios|Systems|Collective|Labs)\b/;
const DATE_PATTERNS = [
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/g,
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b(?:Q[1-4]\s+\d{4}|Q[1-4])\b/g,
  /\b(?:within|after|prior to)\s+\w+\s*\(?\d+\)?\s+(?:days?|months?|years?)\b/gi,
  /\b(?:twelve|thirty|sixty|ninety)\s*\(?\d*\)?\s*(?:-|\s)?(?:day|month|year)s?\b/gi,
];
const ACTION_HINT =
  /\b(will|must|should|agreed to|need to|next step|action|follow up|schedule|send|prepare|draft|confirm|review|diary|book|recommend)\b/i;

function uniqueTop(values: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v.trim();
    if (key.length < 3) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([v]) => v);
}

export const localAiProvider: AiProvider = {
  id: 'local',
  model: 'extractive-v1',
  generative: false,

  async summarizeDocument({ title, text }) {
    const sentences = splitSentences(text);
    const ranked = rankSentences(sentences);
    const summary = ranked
      .slice(0, 3)
      .sort((a, b) => a.index - b.index)
      .map((r) => r.sentence)
      .join(' ');

    const keyPoints = ranked
      .slice(0, 8)
      .sort((a, b) => a.index - b.index)
      .slice(0, 5)
      .map((r) => r.sentence);

    const actionItems = sentences.filter((s) => ACTION_HINT.test(s)).slice(0, 6);

    const candidates = [...text.matchAll(CAPITALISED)].map((m) => m[1]!);
    const organizations = uniqueTop(candidates.filter((c) => ORG_SUFFIX.test(c)), 8);
    const people = uniqueTop(
      candidates.filter((c) => !ORG_SUFFIX.test(c) && c.split(/\s+/).length === 2),
      8,
    ).filter((p) => !organizations.includes(p));

    const importantDates = uniqueTop(
      DATE_PATTERNS.flatMap((re) => [...text.matchAll(re)].map((m) => m[0])),
      8,
    );

    return {
      summary: summary || `No extractable text summary for “${title}”.`,
      keyPoints,
      actionItems,
      people,
      organizations,
      importantDates,
      provider: 'local',
      model: 'extractive-v1',
    };
  },

  async answerQuestion({ question, sources }) {
    const queryTokens = tokenize(question);
    if (!sources.length || !queryTokens.length) {
      return {
        answer:
          'There is nothing in the records available to you that answers this. Try a different question, or upload the relevant document to the Knowledge Hub.',
        citations: [],
        insufficient: true,
        provider: 'local',
        model: 'extractive-v1',
      };
    }

    const picked: AiCitation[] = [];
    const lines: string[] = [];

    sources.forEach((source, i) => {
      const ranked = rankSentences(splitSentences(source.content), queryTokens);
      const best = ranked[0];
      if (!best || best.score < 6) return;
      const index = picked.length + 1;
      picked.push({
        index,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        title: source.title,
        href: source.href,
        excerpt: best.sentence,
      });
      lines.push(`${best.sentence} [${index}]`);
      void i;
    });

    if (!picked.length) {
      return {
        answer:
          'The records available to you mention related terms, but none of them state an answer to this question. Rather than guess, here is nothing — narrow the question, or add the source material to the Knowledge Hub.',
        citations: [],
        insufficient: true,
        provider: 'local',
        model: 'extractive-v1',
      };
    }

    return {
      answer: lines.slice(0, 5).join('\n\n'),
      citations: picked.slice(0, 5),
      insufficient: false,
      provider: 'local',
      model: 'extractive-v1',
    };
  },
};

// --------------------------------------------------------------------------
// Anthropic provider
// --------------------------------------------------------------------------

function parseJsonBlock<T>(text: string, fallback: T): T {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return fallback;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return fallback;
  }
}

export function createAnthropicProvider(apiKey: string, model: string): AiProvider {
  async function call(system: string, user: string, maxTokens = 1600): Promise<string> {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    });
    return response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim();
  }

  return {
    id: 'anthropic',
    model,
    generative: true,

    async summarizeDocument({ title, text }) {
      const raw = await call(
        `You summarise internal business documents for an operating dashboard.
Return ONLY JSON matching:
{"summary":string,"keyPoints":string[],"actionItems":string[],"people":string[],"organizations":string[],"importantDates":string[]}
Rules:
- Use only what the document states. Never infer, extrapolate or add outside knowledge.
- If a field has nothing in the document, return an empty array.
- summary is at most 3 sentences.
- keyPoints are at most 6, each one sentence.`,
        `Title: ${title}\n\n---\n${text.slice(0, 60_000)}`,
      );
      const parsed = parseJsonBlock(raw, {
        summary: '',
        keyPoints: [] as string[],
        actionItems: [] as string[],
        people: [] as string[],
        organizations: [] as string[],
        importantDates: [] as string[],
      });
      // Fall back to extraction rather than returning an empty card.
      if (!parsed.summary) return localAiProvider.summarizeDocument({ title, text });
      return { ...parsed, provider: 'anthropic', model };
    },

    async answerQuestion({ question, sources }) {
      if (!sources.length) {
        return {
          answer:
            'There is nothing in the records available to you that answers this.',
          citations: [],
          insufficient: true,
          provider: 'anthropic',
          model,
        };
      }
      const numbered = sources
        .map((s, i) => `[${i + 1}] ${s.title} (${s.sourceType})\n${s.content.slice(0, 6000)}`)
        .join('\n\n---\n\n');

      const raw = await call(
        `You answer questions about a company's internal records using ONLY the numbered sources provided.
Return ONLY JSON matching: {"answer":string,"citedIndexes":number[],"insufficient":boolean}
Rules:
- Every factual claim in "answer" must be supported by a provided source, and must carry an inline citation like [2].
- If the sources do not contain the answer, set insufficient to true and say plainly that the records do not cover it. Never fill the gap with general knowledge.
- Be concise and specific. Prefer concrete figures, names and dates from the sources.`,
        `Question: ${question}\n\nSources:\n${numbered}`,
      );

      const parsed = parseJsonBlock(raw, {
        answer: '',
        citedIndexes: [] as number[],
        insufficient: true,
      });
      const citations: AiCitation[] = (parsed.citedIndexes ?? [])
        .filter((i) => i >= 1 && i <= sources.length)
        .map((i) => {
          const source = sources[i - 1]!;
          return {
            index: i,
            sourceType: source.sourceType,
            sourceId: source.sourceId,
            title: source.title,
            href: source.href,
            excerpt: source.content.slice(0, 280),
          };
        });

      return {
        answer:
          parsed.answer ||
          'There is nothing in the records available to you that answers this.',
        citations,
        insufficient: parsed.insufficient || citations.length === 0,
        provider: 'anthropic',
        model,
      };
    },
  };
}

/**
 * Resolves the active provider. Anthropic is used only when a key is present
 * AND the provider is selected; otherwise the local extractive provider runs,
 * which is honest about being non-generative.
 */
export function getAiProvider(): AiProvider {
  const env = getEnv();
  if (env.AI_PROVIDER === 'anthropic' && env.ANTHROPIC_API_KEY) {
    return createAnthropicProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL);
  }
  return localAiProvider;
}

export function aiProviderStatus() {
  const env = getEnv();
  const configured = Boolean(env.ANTHROPIC_API_KEY);
  return {
    active: getAiProvider().id,
    anthropicConfigured: configured,
    model: getAiProvider().model,
    note: configured
      ? env.AI_PROVIDER === 'anthropic'
        ? 'Answers are generated by Anthropic from the cited records only.'
        : 'An Anthropic key is configured but AI_PROVIDER is set to local. Set AI_PROVIDER=anthropic to use it.'
      : 'No Anthropic key is configured. Answers are extracted verbatim from your records rather than generated.',
  };
}
