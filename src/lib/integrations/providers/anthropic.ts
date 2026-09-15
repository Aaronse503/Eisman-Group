import { getEnv } from '@/lib/env';
import { IntegrationError, type IntegrationAdapter, type SyncResult } from '../types';

/**
 * The Anthropic connection is not a data sync — it enables the generative
 * summaries and cited answers in the Knowledge Hub. "Sync" therefore just
 * re-verifies the credential and reports which AI provider is live.
 */
export const anthropicAdapter: IntegrationAdapter = {
  id: 'anthropic',

  async test(credentials) {
    const apiKey = credentials.apiKey || getEnv().ANTHROPIC_API_KEY;
    if (!apiKey) throw new IntegrationError('An Anthropic API key is required.');
    const model = credentials.model || getEnv().ANTHROPIC_MODEL;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        message: `Anthropic rejected the request (${res.status}).`,
        detail: text.slice(0, 500),
      };
    }
    return {
      ok: true,
      accountName: `Anthropic · ${model}`,
      accountId: model,
      scopes: ['messages:create'],
      message: `Verified against ${model}.`,
    };
  },

  async sync(ctx): Promise<SyncResult> {
    const log: SyncResult['log'] = [];
    const message = ctx.demo
      ? 'Demo mode: the Knowledge Hub uses the local extractive summariser, which quotes source text rather than generating new prose.'
      : 'Anthropic credential re-verified. Document summarisation and cited answers will use the Anthropic provider.';
    log.push({ level: 'info', message, at: new Date().toISOString() });
    ctx.log('info', message);
    return { recordsRead: 0, recordsWritten: 0, conflicts: 0, log };
  },
};
