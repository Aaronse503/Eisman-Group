import { z } from 'zod';

/** Shared field primitives so validation reads the same everywhere. */
export const optionalString = z
  .string()
  .trim()
  .max(4000)
  .optional()
  .transform((v) => (v ? v : null));

export const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .optional()
  .refine((v) => !v || /^https?:\/\/.+/i.test(v), 'Enter a full URL starting with http:// or https://')
  .transform((v) => (v ? v : null));

export const optionalEmail = z
  .string()
  .trim()
  .max(320)
  .optional()
  .refine((v) => !v || z.string().email().safeParse(v).success, 'Enter a valid email address')
  .transform((v) => (v ? v.toLowerCase() : null));

export const optionalDate = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use the date picker')
  .transform((v) => (v ? v : null));

export const optionalDateTime = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? new Date(v) : null))
  .refine((v) => v === null || !Number.isNaN(v.getTime()), 'Enter a valid date and time');

export const money = z.coerce.number().min(-1_000_000_000).max(1_000_000_000).default(0);

export const percent = z.coerce.number().int().min(0).max(100);

export const optionalUuid = z
  .string()
  .optional()
  .transform((v) => (v && v !== 'none' && v !== '' ? v : null))
  .refine((v) => v === null || z.string().uuid().safeParse(v).success, 'Invalid selection');

export const tagList = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => {
    if (!v) return [];
    const items = Array.isArray(v) ? v : v.split(',');
    return [...new Set(items.map((s) => s.trim()).filter(Boolean))].slice(0, 30);
  });

export const companySchema = z.object({
  name: z.string().trim().min(2, 'Give the company a name').max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens'),
  legalName: optionalString,
  kind: z.enum(['operating', 'holding', 'spv', 'product']).default('operating'),
  description: optionalString,
  website: optionalUrl,
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #0F5132').default('#0F5132'),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #C8A951').default('#C8A951'),
  timezone: z.string().trim().min(1).default('America/New_York'),
  currency: z.string().trim().length(3).toUpperCase().default('USD'),
});

export type CompanyInput = z.infer<typeof companySchema>;

/** Turns a ZodError into `{ field: message }` for react-hook-form. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fields?: Record<string, string> };
