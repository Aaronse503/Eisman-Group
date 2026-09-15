'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireActor, ForbiddenError } from '@/lib/auth/actor';
import { recordAudit } from '@/lib/audit';
import { getEnv } from '@/lib/env';
import { resetDemoData, seedAll, demoCounts } from '@/lib/seed';
import { DEMO_RESET_PHRASE } from '@/lib/validation/demo';
import type { ActionResult } from '@/lib/validation/schemas';

/**
 * Demo data administration.
 *
 * Demo rows are the only rows these actions can touch: every demo table
 * carries an `is_demo` flag and `resetDemoData()` deletes strictly where that
 * flag is true. Production records are never in scope, which is why the reset
 * is safe to expose in the interface at all.
 *
 * `DISABLE_DEMO_DATA=true` blocks both actions outright — that is the switch a
 * production deployment sets so nobody can seed demo rows into real data.
 */

const schema = z.object({
  /** The operator must type this exactly; it is a deliberate speed bump. */
  confirm: z.string(),
  reseed: z.boolean().default(true),
  reason: z.string().trim().min(4, 'Give a short reason for the audit log').max(500),
});

function fail(err: unknown): ActionResult<never> {
  if (err instanceof ForbiddenError) {
    return { ok: false, error: 'Only a Holdings Owner can manage demo data.' };
  }
  return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' };
}

export interface DemoResetSummary {
  deleted: Record<string, number>;
  deletedTotal: number;
  reseeded: boolean;
  counts: Record<string, number>;
}

export async function resetDemoDataAction(input: unknown): Promise<ActionResult<DemoResetSummary>> {
  try {
    const actor = await requireActor();
    if (!actor.can('demo:manage')) throw new ForbiddenError('demo:manage', null);

    const env = getEnv();
    if (env.DISABLE_DEMO_DATA) {
      return {
        ok: false,
        error: 'Demo data is disabled on this deployment (DISABLE_DEMO_DATA=true). Nothing was changed.',
      };
    }

    // A demo account must never be able to delete itself mid-request.
    if (actor.user.is_demo) {
      return { ok: false, error: 'Demo accounts cannot reset demo data. Sign in with a real account.' };
    }

    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
    }
    if (parsed.data.confirm.trim() !== DEMO_RESET_PHRASE) {
      return { ok: false, error: `Type ${DEMO_RESET_PHRASE} exactly to confirm. Nothing was changed.` };
    }

    const before = await demoCounts();
    const deleted = await resetDemoData();
    const deletedTotal = Object.values(deleted).reduce((sum, n) => sum + n, 0);

    let reseeded = false;
    if (parsed.data.reseed) {
      await seedAll({ demo: true });
      reseeded = true;
    }
    const counts = await demoCounts();

    await recordAudit({
      actor,
      companyId: null,
      action: reseeded ? 'demo.reset_and_reseed' : 'demo.reset',
      entityType: 'demo_data',
      entityLabel: reseeded ? 'Demo data reset and reseeded' : 'Demo data cleared',
      reason: parsed.data.reason,
      before,
      after: counts,
      severity: 'notice',
    });

    revalidatePath('/settings/demo-data', 'page');
    revalidatePath('/', 'layout');
    return { ok: true, data: { deleted, deletedTotal, reseeded, counts } };
  } catch (err) {
    return fail(err);
  }
}
