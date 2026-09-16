import { z } from 'zod';

/**
 * Metric kinds an operator is allowed to supply by hand.
 *
 * `raw` and `calculated` are deliberately absent: those are reserved for
 * figures derived from production data. Letting somebody type one in is
 * exactly the silent metric manipulation this system exists to prevent, so the
 * schema refuses them before the action ever reaches the database.
 */
export const OPERATOR_METRIC_KINDS = ['manual', 'forecast', 'target'] as const;

/** Every kind a metric row may carry, including the ones only the system writes. */
export const METRIC_KINDS = ['raw', 'calculated', 'demo', ...OPERATOR_METRIC_KINDS] as const;

export const parfaxMetricSchema = z.object({
  metricKey: z.string().trim().min(2).max(60),
  periodStart: z.string().min(1, 'Choose a start date'),
  periodEnd: z.string().min(1, 'Choose an end date'),
  value: z.coerce.number(),
  unit: z.string().trim().max(30).nullish(),
  kind: z.enum(OPERATOR_METRIC_KINDS),
  sourceLabel: z.string().trim().min(4, 'Say where this number came from'),
  note: z.string().trim().max(1000).nullish(),
});
