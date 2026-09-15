'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sql, one } from '@/lib/db/client';
import { requireCompanyAccess, ForbiddenError } from '@/lib/auth/actor';
import { recordActivity } from '@/lib/activity';
import { recordAudit } from '@/lib/audit';
import { indexSource, removeFromIndex } from '@/lib/knowledge/index-content';
import { fieldErrors, type ActionResult } from '@/lib/validation/schemas';
import {
  clientSchema, contactSchema, dealSchema, organizationSchema, type ClientInput,
} from '@/lib/validation/crm';
import { CLIENT_STAGES, DEAL_STAGES } from '@/lib/domain/crm';

function fail(err: unknown): ActionResult<never> {
  if (err instanceof ForbiddenError) {
    return { ok: false, error: 'You do not have permission to do that in this company.' };
  }
  return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' };
}

async function requireCrmWrite(companyId: string) {
  const actor = await requireCompanyAccess(companyId);
  if (!actor.can('crm:write', companyId)) throw new ForbiddenError('crm:write', companyId);
  return actor;
}

// ------------------------------------------------------------------ client

async function reindexClient(id: string, companyId: string, data: ClientInput) {
  await indexSource({
    companyId,
    sourceType: 'client',
    sourceId: id,
    sourceTitle: data.name,
    sourceUrl: `/crm/clients/${id}`,
    content: [
      `Client: ${data.name}. Status: ${data.status}. Stage: ${data.stage}. Health score: ${data.healthScore}.`,
      data.goals ? `Goals: ${data.goals}` : '',
      data.deliverables ? `Deliverables: ${data.deliverables}` : '',
      data.kpis ? `KPIs: ${data.kpis}` : '',
      data.risks ? `Risks: ${data.risks}` : '',
      data.nextAction ? `Next action: ${data.nextAction}` : '',
    ].filter(Boolean).join('\n'),
  });
}

export async function createClientAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = clientSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fields: fieldErrors(parsed.error) };
    }
    const data = parsed.data;
    const actor = await requireCrmWrite(data.companyId);

    const row = await one<{ id: string }>(
      `insert into clients
         (company_id, organization_id, name, status, stage, account_owner_id, website, socials,
          services, monthly_retainer, contract_value, currency, contract_start, contract_end,
          renewal_date, billing_status, health_score, goals, deliverables, kpis, risks,
          next_action, next_action_date)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       returning id`,
      [
        data.companyId, data.organizationId, data.name, data.status, data.stage,
        data.accountOwnerId ?? actor.user.id, data.website,
        JSON.stringify({ linkedin: data.linkedin, instagram: data.instagram }),
        data.services, data.monthlyRetainer, data.contractValue, data.currency,
        data.contractStart, data.contractEnd, data.renewalDate, data.billingStatus,
        data.healthScore, data.goals, data.deliverables, data.kpis, data.risks,
        data.nextAction, data.nextActionDate,
      ],
    );

    await reindexClient(row!.id, data.companyId, data);
    await recordActivity({
      actor, companyId: data.companyId, entityType: 'client', entityId: row!.id,
      action: 'created', summary: `Added the client ${data.name}`,
    });
    await recordAudit({
      actor, companyId: data.companyId, action: 'client.created',
      entityType: 'client', entityId: row!.id, entityLabel: data.name, after: data,
    });
    revalidatePath('/crm');
    return { ok: true, data: { id: row!.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function updateClientAction(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = clientSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fields: fieldErrors(parsed.error) };
    }
    const data = parsed.data;
    const before = await one<Record<string, unknown>>(
      `select * from clients where id = $1 and deleted_at is null`, [id],
    );
    if (!before) return { ok: false, error: 'Client not found.' };
    const actor = await requireCrmWrite(before.company_id as string);

    await sql(
      `update clients set
         organization_id = $2, name = $3, status = $4, stage = $5, account_owner_id = $6,
         website = $7, socials = $8, services = $9, monthly_retainer = $10, contract_value = $11,
         currency = $12, contract_start = $13, contract_end = $14, renewal_date = $15,
         billing_status = $16, health_score = $17, goals = $18, deliverables = $19, kpis = $20,
         risks = $21, next_action = $22, next_action_date = $23
       where id = $1`,
      [
        id, data.organizationId, data.name, data.status, data.stage, data.accountOwnerId,
        data.website, JSON.stringify({ linkedin: data.linkedin, instagram: data.instagram }),
        data.services, data.monthlyRetainer, data.contractValue, data.currency,
        data.contractStart, data.contractEnd, data.renewalDate, data.billingStatus,
        data.healthScore, data.goals, data.deliverables, data.kpis, data.risks,
        data.nextAction, data.nextActionDate,
      ],
    );

    await reindexClient(id, before.company_id as string, data);
    await recordActivity({
      actor, companyId: before.company_id as string, entityType: 'client', entityId: id,
      action: 'updated', summary: `Updated ${data.name}`,
    });
    await recordAudit({
      actor, companyId: before.company_id as string, action: 'client.updated',
      entityType: 'client', entityId: id, entityLabel: data.name,
      before: { status: before.status, health_score: before.health_score, monthly_retainer: before.monthly_retainer },
      after: { status: data.status, health_score: data.healthScore, monthly_retainer: data.monthlyRetainer },
    });
    revalidatePath('/crm');
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err);
  }
}

export async function moveClientStageAction(id: string, stage: string): Promise<ActionResult<null>> {
  try {
    if (!(CLIENT_STAGES as readonly string[]).includes(stage)) {
      return { ok: false, error: 'Unknown stage.' };
    }
    const before = await one<{ company_id: string; name: string; stage: string }>(
      `select company_id, name, stage from clients where id = $1 and deleted_at is null`, [id],
    );
    if (!before) return { ok: false, error: 'Client not found.' };
    const actor = await requireCrmWrite(before.company_id);
    await sql(`update clients set stage = $2 where id = $1`, [id, stage]);
    await recordActivity({
      actor, companyId: before.company_id, entityType: 'client', entityId: id,
      action: 'stage_changed', summary: `Moved ${before.name} to ${stage.replace(/_/g, ' ')}`,
      meta: { from: before.stage, to: stage },
    });
    revalidatePath('/crm');
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

const archiveSchema = z.object({
  id: z.string().uuid(),
  archived: z.boolean(),
  reason: z.string().trim().min(4, 'Give a short reason — it is recorded in the audit log.'),
});

export async function archiveClientAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const parsed = archiveSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
    const { id, archived, reason } = parsed.data;
    const before = await one<{ company_id: string; name: string; archived_at: Date | null }>(
      `select company_id, name, archived_at from clients where id = $1 and deleted_at is null`, [id],
    );
    if (!before) return { ok: false, error: 'Client not found.' };
    const actor = await requireCrmWrite(before.company_id);

    // Soft archive only. Business records are never hard-deleted here.
    await sql(`update clients set archived_at = $2 where id = $1`, [id, archived ? new Date() : null]);
    if (archived) await removeFromIndex('client', id);

    await recordAudit({
      actor, companyId: before.company_id,
      action: archived ? 'client.archived' : 'client.restored',
      entityType: 'client', entityId: id, entityLabel: before.name,
      reason, severity: 'warning',
      before: { archived_at: before.archived_at },
      after: { archived_at: archived ? new Date() : null },
    });
    await recordActivity({
      actor, companyId: before.company_id, entityType: 'client', entityId: id,
      action: archived ? 'archived' : 'restored',
      summary: `${archived ? 'Archived' : 'Restored'} ${before.name}`, meta: { reason },
    });
    revalidatePath('/crm');
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

// ----------------------------------------------------------------- contact

async function saveContactRoles(contactId: string, roles: string[]) {
  await sql(`delete from contact_roles where contact_id = $1`, [contactId]);
  for (const role of [...new Set(roles)]) {
    await sql(
      `insert into contact_roles (contact_id, role) values ($1,$2) on conflict do nothing`,
      [contactId, role],
    );
  }
}

export async function createContactAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = contactSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fields: fieldErrors(parsed.error) };
    }
    const data = parsed.data;
    const actor = await requireCrmWrite(data.companyId);

    const row = await one<{ id: string }>(
      `insert into contacts
         (company_id, organization_id, first_name, last_name, email, secondary_email, phone,
          title, linkedin_url, twitter_url, city, country, timezone, description, owner_user_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`,
      [
        data.companyId, data.organizationId, data.firstName, data.lastName, data.email,
        data.secondaryEmail, data.phone, data.title, data.linkedinUrl, data.twitterUrl,
        data.city, data.country, data.timezone, data.description,
        data.ownerUserId ?? actor.user.id,
      ],
    );
    await saveContactRoles(row!.id, data.roles);
    if (data.clientId) {
      await sql(
        `insert into client_contacts (client_id, contact_id, role, is_primary)
         values ($1,$2,'contact', not exists (select 1 from client_contacts where client_id = $1))
         on conflict (client_id, contact_id) do nothing`,
        [data.clientId, row!.id],
      );
    }

    const label = `${data.firstName} ${data.lastName ?? ''}`.trim();
    await recordActivity({
      actor, companyId: data.companyId, entityType: 'contact', entityId: row!.id,
      action: 'created', summary: `Added the contact ${label}`,
    });
    await recordAudit({
      actor, companyId: data.companyId, action: 'contact.created',
      entityType: 'contact', entityId: row!.id, entityLabel: label,
    });
    revalidatePath('/crm/contacts');
    return { ok: true, data: { id: row!.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function updateContactAction(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = contactSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fields: fieldErrors(parsed.error) };
    }
    const data = parsed.data;
    const before = await one<{ company_id: string; first_name: string; last_name: string | null; email: string | null }>(
      `select company_id, first_name, last_name, email from contacts where id = $1 and deleted_at is null`, [id],
    );
    if (!before) return { ok: false, error: 'Contact not found.' };
    const actor = await requireCrmWrite(before.company_id);

    await sql(
      `update contacts set
         organization_id = $2, first_name = $3, last_name = $4, email = $5, secondary_email = $6,
         phone = $7, title = $8, linkedin_url = $9, twitter_url = $10, city = $11, country = $12,
         timezone = $13, description = $14, owner_user_id = $15
       where id = $1`,
      [
        id, data.organizationId, data.firstName, data.lastName, data.email, data.secondaryEmail,
        data.phone, data.title, data.linkedinUrl, data.twitterUrl, data.city, data.country,
        data.timezone, data.description, data.ownerUserId,
      ],
    );
    await saveContactRoles(id, data.roles);

    const label = `${data.firstName} ${data.lastName ?? ''}`.trim();
    await recordAudit({
      actor, companyId: before.company_id, action: 'contact.updated',
      entityType: 'contact', entityId: id, entityLabel: label,
      before: { email: before.email }, after: { email: data.email },
    });
    await recordActivity({
      actor, companyId: before.company_id, entityType: 'contact', entityId: id,
      action: 'updated', summary: `Updated the contact ${label}`,
    });
    revalidatePath('/crm/contacts');
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err);
  }
}

// ------------------------------------------------------------ organization

export async function createOrganizationAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = organizationSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fields: fieldErrors(parsed.error) };
    }
    const data = parsed.data;
    const actor = await requireCrmWrite(data.companyId);
    const row = await one<{ id: string }>(
      `insert into organizations
         (company_id, name, legal_name, domain, website, industry, size_band, description,
          linkedin_url, city, region, country, owner_user_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
      [
        data.companyId, data.name, data.legalName, data.domain, data.website, data.industry,
        data.sizeBand, data.description, data.linkedinUrl, data.city, data.region, data.country,
        data.ownerUserId ?? actor.user.id,
      ],
    );
    for (const role of data.roles) {
      await sql(
        `insert into organization_roles (organization_id, role) values ($1,$2) on conflict do nothing`,
        [row!.id, role],
      );
    }
    await recordActivity({
      actor, companyId: data.companyId, entityType: 'organization', entityId: row!.id,
      action: 'created', summary: `Added the organization ${data.name}`,
    });
    revalidatePath('/crm/organizations');
    return { ok: true, data: { id: row!.id } };
  } catch (err) {
    return fail(err);
  }
}

// -------------------------------------------------------------------- deal

export async function createDealAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = dealSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fields: fieldErrors(parsed.error) };
    }
    const data = parsed.data;
    const actor = await requireCrmWrite(data.companyId);
    const row = await one<{ id: string }>(
      `insert into deals
         (company_id, client_id, organization_id, primary_contact_id, name, stage, value,
          currency, probability, expected_close, source, owner_user_id, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
      [
        data.companyId, data.clientId, data.organizationId, data.primaryContactId, data.name,
        data.stage, data.value, data.currency, data.probability, data.expectedClose,
        data.source, data.ownerUserId ?? actor.user.id, data.notes,
      ],
    );
    await recordActivity({
      actor, companyId: data.companyId, entityType: 'deal', entityId: row!.id,
      action: 'created', summary: `Created the deal ${data.name}`,
    });
    revalidatePath('/crm/deals');
    return { ok: true, data: { id: row!.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function moveDealStageAction(id: string, stage: string): Promise<ActionResult<null>> {
  try {
    if (!(DEAL_STAGES as readonly string[]).includes(stage)) {
      return { ok: false, error: 'Unknown stage.' };
    }
    const before = await one<{ company_id: string; name: string; stage: string; value: number }>(
      `select company_id, name, stage, value from deals where id = $1 and deleted_at is null`, [id],
    );
    if (!before) return { ok: false, error: 'Deal not found.' };
    const actor = await requireCrmWrite(before.company_id);
    await sql(
      `update deals set stage = $2,
         closed_at = case when $2 in ('won','lost') then now() else null end,
         probability = case when $2 = 'won' then 100 when $2 = 'lost' then 0 else probability end
       where id = $1`,
      [id, stage],
    );
    await recordActivity({
      actor, companyId: before.company_id, entityType: 'deal', entityId: id,
      action: 'stage_changed', summary: `Moved the deal ${before.name} to ${stage}`,
      meta: { from: before.stage, to: stage, value: before.value },
    });
    if (stage === 'won' || stage === 'lost') {
      await recordAudit({
        actor, companyId: before.company_id, action: `deal.${stage}`,
        entityType: 'deal', entityId: id, entityLabel: before.name,
        before: { stage: before.stage }, after: { stage, value: before.value },
      });
    }
    revalidatePath('/crm/deals');
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function linkContactToClientAction(clientId: string, contactId: string, isPrimary = false) {
  try {
    const client = await one<{ company_id: string; name: string }>(
      `select company_id, name from clients where id = $1 and deleted_at is null`, [clientId],
    );
    if (!client) return { ok: false as const, error: 'Client not found.' };
    await requireCrmWrite(client.company_id);
    if (isPrimary) {
      await sql(`update client_contacts set is_primary = false where client_id = $1`, [clientId]);
    }
    await sql(
      `insert into client_contacts (client_id, contact_id, is_primary) values ($1,$2,$3)
       on conflict (client_id, contact_id) do update set is_primary = excluded.is_primary`,
      [clientId, contactId, isPrimary],
    );
    revalidatePath(`/crm/clients/${clientId}`);
    return { ok: true as const, data: null };
  } catch (err) {
    return fail(err);
  }
}
