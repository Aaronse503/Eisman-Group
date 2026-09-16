'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sql, one } from '@/lib/db/client';
import { requireActor, requirePermission, ForbiddenError } from '@/lib/auth/actor';
import { recordAudit } from '@/lib/audit';
import { recordActivity } from '@/lib/activity';
import { companySchema, fieldErrors, type ActionResult } from '@/lib/validation/schemas';
import { slugify } from '@/lib/utils';
import { PROVIDERS } from '@/lib/integrations/registry';

export async function createCompanyAction(input: unknown): Promise<ActionResult<{ slug: string }>> {
  let actor;
  try {
    actor = await requirePermission('company:create');
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { ok: false, error: 'Only a Holdings Owner can create a company.' };
    }
    throw err;
  }

  const parsed = companySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Check the highlighted fields.', fields: fieldErrors(parsed.error) };
  }
  const data = parsed.data;

  const clash = await one<{ id: string }>(`select id from companies where slug = $1`, [data.slug]);
  if (clash) {
    return {
      ok: false,
      error: 'That URL slug is already in use.',
      fields: { slug: 'Already taken — pick another.' },
    };
  }

  const holding = await one<{ id: string }>(`select id from holdings order by created_at limit 1`);
  if (!holding) return { ok: false, error: 'No holding company exists. Run the setup first.' };

  const [{ max }] = await sql<{ max: number }>(
    `select coalesce(max(position), 0) + 1 as max from companies`,
  );

  const company = await one<{ id: string; slug: string }>(
    `insert into companies
       (holding_id, slug, name, legal_name, kind, description, website,
        brand_color, accent_color, timezone, currency, position)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     returning id, slug`,
    [
      holding.id,
      data.slug,
      data.name,
      data.legalName,
      data.kind,
      data.description,
      data.website,
      data.brandColor,
      data.accentColor,
      data.timezone,
      data.currency,
      max,
    ],
  );

  // A new company starts with a usable skeleton rather than a blank shell.
  await sql(
    `insert into departments (company_id, name, description)
     values ($1, 'General', 'Default department created with the company.')`,
    [company!.id],
  );
  await sql(
    `insert into folders (company_id, name, description) values
       ($1, 'Contracts', 'Signed agreements and amendments'),
       ($1, 'Reporting', 'Recurring reporting and reviews'),
       ($1, 'Internal', 'Playbooks and operating documents')`,
    [company!.id],
  );
  await sql(
    `insert into calendars (company_id, name, provider) values ($1, $2, 'internal')`,
    [company!.id, `${data.name} — Team`],
  );
  for (const provider of PROVIDERS.filter((p) => p.scope === 'company')) {
    await sql(
      `insert into integration_connections (company_id, provider, created_by_id)
       values ($1,$2,$3)
       on conflict (provider, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid))
       do nothing`,
      [company!.id, provider.id, actor.user.id],
    );
  }

  await recordAudit({
    actor,
    companyId: company!.id,
    action: 'company.created',
    entityType: 'company',
    entityId: company!.id,
    entityLabel: data.name,
    severity: 'notice',
    after: data,
  });
  await recordActivity({
    actor,
    companyId: company!.id,
    entityType: 'company',
    entityId: company!.id,
    action: 'created',
    summary: `Created the company ${data.name}`,
  });

  revalidatePath('/', 'layout');
  return { ok: true, data: { slug: company!.slug } };
}

export async function updateCompanyAction(
  companyId: string,
  input: unknown,
): Promise<ActionResult<{ slug: string }>> {
  const actor = await requirePermission('company:write', companyId);
  const parsed = companySchema.partial({ slug: true }).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Check the highlighted fields.', fields: fieldErrors(parsed.error) };
  }
  const before = await one<Record<string, unknown>>(`select * from companies where id = $1`, [companyId]);
  if (!before) return { ok: false, error: 'Company not found.' };

  const data = parsed.data;
  const after = await one<{ slug: string }>(
    `update companies set
       name = $2, legal_name = $3, kind = $4, description = $5, website = $6,
       brand_color = $7, accent_color = $8, timezone = $9, currency = $10
     where id = $1 returning slug`,
    [
      companyId,
      data.name,
      data.legalName,
      data.kind,
      data.description,
      data.website,
      data.brandColor,
      data.accentColor,
      data.timezone,
      data.currency,
    ],
  );

  await recordAudit({
    actor,
    companyId,
    action: 'company.updated',
    entityType: 'company',
    entityId: companyId,
    entityLabel: data.name,
    before: { name: before.name, website: before.website, kind: before.kind },
    after: data,
  });
  revalidatePath('/', 'layout');
  return { ok: true, data: { slug: after!.slug } };
}

const archiveSchema = z.object({
  companyId: z.string().uuid(),
  archived: z.boolean(),
  reason: z.string().trim().min(4, 'Give a short reason — it is recorded in the audit log.'),
});

export async function setCompanyArchivedAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = archiveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }
  const { companyId, archived, reason } = parsed.data;
  const actor = await requirePermission('company:archive', companyId);

  const before = await one<{ name: string; archived_at: Date | null }>(
    `select name, archived_at from companies where id = $1`,
    [companyId],
  );
  if (!before) return { ok: false, error: 'Company not found.' };

  await sql(
    `update companies set archived_at = $2, status = $3 where id = $1`,
    [companyId, archived ? new Date() : null, archived ? 'archived' : 'active'],
  );
  await recordAudit({
    actor,
    companyId,
    action: archived ? 'company.archived' : 'company.restored',
    entityType: 'company',
    entityId: companyId,
    entityLabel: before.name,
    reason,
    severity: 'warning',
    before: { archived_at: before.archived_at },
    after: { archived_at: archived ? new Date() : null },
  });
  await recordActivity({
    actor,
    companyId,
    entityType: 'company',
    entityId: companyId,
    action: archived ? 'archived' : 'restored',
    summary: `${archived ? 'Archived' : 'Restored'} ${before.name}`,
    meta: { reason },
  });
  revalidatePath('/', 'layout');
  return { ok: true, data: null };
}

export async function suggestSlugAction(name: string) {
  await requireActor();
  const base = slugify(name) || 'company';
  let candidate = base;
  let n = 2;
  while (await one(`select 1 from companies where slug = $1`, [candidate])) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}
