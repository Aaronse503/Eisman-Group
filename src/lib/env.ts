import { z } from 'zod';

/**
 * Environment contract. Nothing here is required to boot the app: with an
 * empty environment the app runs on embedded Postgres in Demo Mode, and every
 * integration reports itself as disconnected rather than pretending to work.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),

  // --- data -------------------------------------------------------------
  DATABASE_URL: z.string().min(1).optional(),
  PGLITE_DATA_DIR: z.string().default('.data/pglite'),

  // --- security ---------------------------------------------------------
  /** Signing key for session cookies. Required in production. */
  AUTH_SECRET: z.string().min(32).optional(),
  /** AES-256-GCM key (base64, 32 bytes) for integration credentials at rest. */
  ENCRYPTION_KEY: z.string().optional(),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),

  // --- storage ----------------------------------------------------------
  STORAGE_DRIVER: z.enum(['local', 'supabase']).default('local'),
  LOCAL_STORAGE_DIR: z.string().default('.data/files'),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default('command-center'),

  // --- integrations (all optional; absence = disconnected) --------------
  CLICKUP_API_TOKEN: z.string().optional(),
  CLICKUP_TEAM_ID: z.string().optional(),
  CLICKUP_WEBHOOK_SECRET: z.string().optional(),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  GUSTO_ACCESS_TOKEN: z.string().optional(),
  GUSTO_COMPANY_ID: z.string().optional(),
  GUSTO_API_BASE: z.string().url().default('https://api.gusto.com'),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),

  PARFAX_API_BASE: z.string().optional(),
  PARFAX_API_KEY: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5'),
  AI_PROVIDER: z.enum(['anthropic', 'local']).default('local'),

  /** Master switch for demo data + demo-mode integrations. */
  DEMO_MODE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /** Blocks the demo seed/reset scripts. Set to `true` on production. */
  DISABLE_DEMO_DATA: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  CRON_SECRET: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvForTests() {
  cached = null;
}

/**
 * Hard failures that must stop a production boot. Called by `validateEnv` in
 * the production server entrypoint and by `npm run build`.
 */
export function productionEnvProblems(env: Env = getEnv()): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];
  if (!env.AUTH_SECRET) problems.push('AUTH_SECRET is required in production (32+ chars).');
  if (!env.DATABASE_URL)
    problems.push('DATABASE_URL is required in production; PGlite is for local use only.');
  if (!env.ENCRYPTION_KEY)
    problems.push('ENCRYPTION_KEY is required in production to encrypt integration credentials.');
  if (env.STORAGE_DRIVER === 'supabase' && !(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY))
    problems.push('STORAGE_DRIVER=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  return problems;
}

export const isDemoModeAvailable = () => getEnv().DEMO_MODE && !getEnv().DISABLE_DEMO_DATA;
