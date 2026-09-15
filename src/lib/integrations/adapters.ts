import type { ProviderId } from './registry';
import type { IntegrationAdapter } from './types';
import { clickupAdapter } from './providers/clickup';
import { stripeAdapter } from './providers/stripe';
import { gustoAdapter } from './providers/gusto';
import { googleCalendarAdapter } from './providers/google-calendar';
import { parfaxAdapter } from './providers/parfax';
import { anthropicAdapter } from './providers/anthropic';

const ADAPTERS: Partial<Record<ProviderId, IntegrationAdapter>> = {
  clickup: clickupAdapter,
  stripe: stripeAdapter,
  gusto: gustoAdapter,
  google_calendar: googleCalendarAdapter,
  parfax_crm: parfaxAdapter,
  anthropic: anthropicAdapter,
};

export function getAdapter(provider: ProviderId): IntegrationAdapter | null {
  return ADAPTERS[provider] ?? null;
}
