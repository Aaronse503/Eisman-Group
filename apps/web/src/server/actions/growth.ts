'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sql, one } from '@/lib/db/client';
import { requireActor, requireCompanyAccess, ForbiddenError } from '@/lib/auth/actor';
import { recordActivity } from '@/lib/activity';
import { recordAudit } from '@/lib/audit';
import { indexSource, removeFromIndex } from '@/lib/knowledge/index-content';
import { fieldErrors, type ActionResult } from '@/lib/validation/schemas';
import { investorSchema, partnershipSchema } from '@/lib/validation/growth';
import { INVESTOR_STAGES, PARTNERSHIP_STAGES, STAGE_PROBABILITY, type InvestorStage } from '@/lib/domain/growth';
import { rethrowControlFlow } from '@/lib/action-errors';

function fail(err: unknown): ActionResult<never> {
  rethrowControlFlow(err);
  if (err instanceof ForbiddenError) {
    return { ok: false, error: 'You do not have permission to do that here.' };
  }
  return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' };
}

// ------------------------------------------------------------ partnerships

async function requirePartnershipWrite(companyId: string) {
  const actor = await requireCompanyAccess(companyId);
  if (!actor.can('partnership:write', companyId)) {
    throw new ForbiddenError('partnership:write', companyId);
  }
  return actor;
}

async function indexPartnership(id: string, companyId: string, data: { name: string; category: string; stage: string; revenueShare: string | null; pilotLocation: string | null; equipmentRequirements: string | null; nextAction: string | null; notes: string | null; contractStatus: string }) {
  await indexSource({
    companyId,
    sourceType: 'partnership',
    sourceId: id,
    sourceTitle: data.name,
    sourceUrl: `/partnerships/${id}`,
    content: [
      `Partnership: ${data.name}. Category: ${data.category}. Stage: ${data.stage}. Contract status: ${data.contractStatus}.`,
      data.revenueShare ? `Revenue share: ${data.revenueShare}` : '',
      data.pilotLocation ? `Pilot location: ${data.pilotLocation}` : '',
      data.equipmentRequirements ? `Equipment: ${data.equipmentRequirements}` : '',
      data.nextAction ? `Next action: ${data.nextAction}` : '',
      data.notes ?? '',
    ].filter(Boolean).join('\n'),
  });
}

async function savePartnershipContacts(partnershipId: string, contactIds: string[]) {
  await sql(`delete from partnership_contacts where partnership_id = $1`, [partnershipId]);
  for (const [i, contactId] of [...new Set(contactIds)].entries()) {
    await sql(
      `insert into partnership_contacts (partnership_id, contact_id, is_primary)
       values ($1,$2,$3) on conflict do nothing`,
      [partnershipId, contactId, i === 0],
    );
  }
}

export async function createPartnershipAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = partnershipSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fields: fieldErrors(parsed.error) };
    }
    const data = parsed.data;
    const actor = await requirePartnershipWrite(data.companyId);

    const row = await one<{ id: string }>(
      `insert into partnerships
         (company_id, organization_id, name, category, stage, estimated_value, currency,
          revenue_share, pilot_location, equipment_requirements, contract_status, launch_date,
          probability, owner_user_id, next_action, next_action_date, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning id`,
      [
        data.companyId, data.organizationId, data.name, data.category, data.stage,
        data.estimatedValue, data.currency, data.revenueShare, data.pilotLocation,
        data.equipmentRequirements, data.contractStatus, data.launchDate, data.probability,
        data.ownerUserId ?? actor.user.id, data.nextAction, data.nextActionDate, data.notes,
      ],
    );
    await savePartnershipContacts(row!.id, data.contactIds);
    await indexPartnership(row!.id, data.companyId, data);

    await recordActivity({
      actor, companyId: data.companyId, entityType: 'partnership', entityId: row!.id,
      action: 'created', summary: `Added the partnership ${data.name}`,
    });
    revalidatePath('/partnerships');
    return { ok: true, data: { id: row!.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function updatePartnershipAction(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = partnershipSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fields: fieldErrors(parsed.error) };
    }
    const data = parsed.data;
    const before = await one<{ company_id: string; stage: string; contract_status: string }>(
      `select company_id, stage, contract_status from partnerships where id = $1 and deleted_at is null`,
      [id],
    );
    if (!before) return { ok: false, error: 'Partnership not found.' };
    const actor = await requirePartnershipWrite(before.company_id);

    await sql(
      `update partnerships set
         organization_id = $2, name = $3, category = $4, stage = $5, estimated_value = $6,
         currency = $7, revenue_share = $8, pilot_location = $9, equipment_requirements = $10,
         contract_status = $11, launch_date = $12, probability = $13, owner_user_id = $14,
         next_action = $15, next_action_date = $16, notes = $17
       where id = $1`,
      [
        id, data.organizationId, data.name, data.category, data.stage, data.estimatedValue,
        data.currency, data.revenueShare, data.pilotLocation, data.equipmentRequirements,
        data.contractStatus, data.launchDate, data.probability, data.ownerUserId,
        data.nextAction, data.nextActionDate, data.notes,
      ],
    );
    await savePartnershipContacts(id, data.contactIds);
    await indexPartnership(id, before.company_id, data);

    if (before.contract_status !== data.contractStatus) {
      await recordAudit({
        actor, companyId: before.company_id, action: 'partnership.contract_status_changed',
        entityType: 'partnership', entityId: id, entityLabel: data.name, severity: 'notice',
        before: { contract_status: before.contract_status },
        after: { contract_status: data.contractStatus },
      });
    }
    await recordActivity({
      actor, companyId: before.company_id, entityType: 'partnership', entityId: id,
      action: 'updated', summary: `Updated ${data.name}`,
    });
    revalidatePath('/partnerships');
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err);
  }
}

export async function movePartnershipStageAction(id: string, stage: string): Promise<ActionResult<null>> {
  try {
    if (!(PARTNERSHIP_STAGES as readonly string[]).includes(stage)) {
      return { ok: false, error: 'Unknown stage.' };
    }
    const before = await one<{ company_id: string; name: string; stage: string }>(
      `select company_id, name, stage from partnerships where id = $1 and deleted_at is null`,
      [id],
    );
    if (!before) return { ok: false, error: 'Partnership not found.' };
    const actor = await requirePartnershipWrite(before.company_id);
    await sql(`update partnerships set stage = $2, last_interaction_at = now() where id = $1`, [id, stage]);
    await recordActivity({
      actor, companyId: before.company_id, entityType: 'partnership', entityId: id,
      action: 'stage_changed', summary: `Moved ${before.name} to ${stage.replace(/_/g, ' ')}`,
      meta: { from: before.stage, to: stage },
    });
    revalidatePath('/partnerships');
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function archivePartnershipAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const parsed = z
      .object({ id: z.string().uuid(), archived: z.boolean(), reason: z.string().trim().min(4) })
      .safeParse(input);
    if (!parsed.success) return { ok: false, error: 'A reason of at least 4 characters is required.' };
    const before = await one<{ company_id: string; name: string }>(
      `select company_id, name from partnerships where id = $1 and deleted_at is null`, [parsed.data.id],
    );
    if (!before) return { ok: false, error: 'Partnership not found.' };
    const actor = await requirePartnershipWrite(before.company_id);
    await sql(`update partnerships set archived_at = $2 where id = $1`, [
      parsed.data.id, parsed.data.archived ? new Date() : null,
    ]);
    if (parsed.data.archived) await removeFromIndex('partnership', parsed.data.id);
    await recordAudit({
      actor, companyId: before.company_id,
      action: parsed.data.archived ? 'partnership.archived' : 'partnership.restored',
      entityType: 'partnership', entityId: parsed.data.id, entityLabel: before.name,
      reason: parsed.data.reason, severity: 'notice',
    });
    revalidatePath('/partnerships');
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------- investors

async function requireInvestorWrite(companyId: string) {
  const actor = await requireCompanyAccess(companyId);
  if (!actor.can('investor:write', companyId)) throw new ForbiddenError('investor:write', companyId);
  return actor;
}

async function saveInvestorContacts(investorId: string, contactIds: string[]) {
  await sql(`delete from investor_contacts where investor_id = $1`, [investorId]);
  for (const [i, contactId] of [...new Set(contactIds)].entries()) {
    await sql(
      `insert into investor_contacts (investor_id, contact_id, is_primary) values ($1,$2,$3)
       on conflict do nothing`,
      [investorId, contactId, i === 0],
    );
  }
}

async function indexInvestor(id: string, companyId: string, data: { name: string; investorType: string; pipelineStage: string; warmIntroSource: string | null; objections: string | null; requestedMaterials: string | null; notes: string | null }) {
  await indexSource({
    companyId,
    sourceType: 'investor',
    sourceId: id,
    sourceTitle: data.name,
    sourceUrl: `/investors/${id}`,
    content: [
      `Investor: ${data.name}. Type: ${data.investorType}. Pipeline stage: ${data.pipelineStage}.`,
      data.warmIntroSource ? `Warm intro: ${data.warmIntroSource}` : '',
      data.objections ? `Objections: ${data.objections}` : '',
      data.requestedMaterials ? `Requested materials: ${data.requestedMaterials}` : '',
      data.notes ?? '',
    ].filter(Boolean).join('\n'),
  });
}

export async function createInvestorAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = investorSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fields: fieldErrors(parsed.error) };
    }
    const data = parsed.data;
    const actor = await requireInvestorWrite(data.pitchingCompanyId);
    const holding = await one<{ id: string }>(`select id from holdings order by created_at limit 1`);
    if (!holding) return { ok: false, error: 'No holding company exists.' };

    const row = await one<{ id: string }>(
      `insert into investors
         (holding_id, organization_id, name, website, investor_type, check_size_min, check_size_max,
          currency, stage_preferences, industry_focus, geography, portfolio_companies,
          warm_intro_source, pitching_company_id, owner_user_id, outreach_status, pipeline_stage,
          interest_level, probability, potential_amount, objections, requested_materials,
          data_room_access, data_room_granted_at, last_contact_at, next_follow_up_at,
          first_meeting_at, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
       returning id`,
      [
        holding.id, data.organizationId, data.name, data.website, data.investorType,
        data.checkSizeMin, data.checkSizeMax, data.currency, data.stagePreferences,
        data.industryFocus, data.geography, data.portfolioCompanies, data.warmIntroSource,
        data.pitchingCompanyId, data.ownerUserId ?? actor.user.id, data.outreachStatus,
        data.pipelineStage, data.interestLevel,
        data.probability || STAGE_PROBABILITY[data.pipelineStage as InvestorStage],
        data.potentialAmount, data.objections, data.requestedMaterials, data.dataRoomAccess,
        data.dataRoomAccess ? new Date() : null, data.lastContactAt, data.nextFollowUpAt,
        data.firstMeetingAt, data.notes,
      ],
    );
    await saveInvestorContacts(row!.id, data.contactIds);
    await indexInvestor(row!.id, data.pitchingCompanyId, data);

    if (data.nextFollowUpAt) {
      await sql(
        `insert into reminders (user_id, entity_type, entity_id, title, body, remind_at)
         values ($1,'investor',$2,$3,$4,$5)`,
        [
          data.ownerUserId ?? actor.user.id, row!.id, `Follow up with ${data.name}`,
          'Scheduled when the investor was added.', data.nextFollowUpAt,
        ],
      );
    }

    await recordActivity({
      actor, companyId: data.pitchingCompanyId, entityType: 'investor', entityId: row!.id,
      action: 'created', summary: `Added ${data.name} to the investor pipeline`,
    });
    revalidatePath('/investors');
    return { ok: true, data: { id: row!.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function updateInvestorAction(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = investorSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fields: fieldErrors(parsed.error) };
    }
    const data = parsed.data;
    const before = await one<{ pitching_company_id: string | null; data_room_access: boolean; name: string }>(
      `select pitching_company_id, data_room_access, name from investors where id = $1 and deleted_at is null`,
      [id],
    );
    if (!before) return { ok: false, error: 'Investor not found.' };
    const actor = await requireInvestorWrite(data.pitchingCompanyId);

    await sql(
      `update investors set
         organization_id = $2, name = $3, website = $4, investor_type = $5, check_size_min = $6,
         check_size_max = $7, currency = $8, stage_preferences = $9, industry_focus = $10,
         geography = $11, portfolio_companies = $12, warm_intro_source = $13,
         pitching_company_id = $14, owner_user_id = $15, outreach_status = $16, pipeline_stage = $17,
         interest_level = $18, probability = $19, potential_amount = $20, objections = $21,
         requested_materials = $22, data_room_access = $23,
         data_room_granted_at = case when $23 and not $24 then now()
                                     when not $23 then null else data_room_granted_at end,
         last_contact_at = $25, next_follow_up_at = $26, first_meeting_at = $27, notes = $28
       where id = $1`,
      [
        id, data.organizationId, data.name, data.website, data.investorType, data.checkSizeMin,
        data.checkSizeMax, data.currency, data.stagePreferences, data.industryFocus, data.geography,
        data.portfolioCompanies, data.warmIntroSource, data.pitchingCompanyId, data.ownerUserId,
        data.outreachStatus, data.pipelineStage, data.interestLevel, data.probability,
        data.potentialAmount, data.objections, data.requestedMaterials, data.dataRoomAccess,
        before.data_room_access, data.lastContactAt, data.nextFollowUpAt, data.firstMeetingAt,
        data.notes,
      ],
    );
    await saveInvestorContacts(id, data.contactIds);
    await indexInvestor(id, data.pitchingCompanyId, data);

    // Data room access is a disclosure decision, so it is audited on its own.
    if (before.data_room_access !== data.dataRoomAccess) {
      await recordAudit({
        actor, companyId: data.pitchingCompanyId, action: 'investor.data_room_access_changed',
        entityType: 'investor', entityId: id, entityLabel: data.name, severity: 'warning',
        before: { data_room_access: before.data_room_access },
        after: { data_room_access: data.dataRoomAccess },
      });
    }
    await recordActivity({
      actor, companyId: data.pitchingCompanyId, entityType: 'investor', entityId: id,
      action: 'updated', summary: `Updated ${data.name}`,
    });
    revalidatePath('/investors');
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err);
  }
}

export async function moveInvestorStageAction(id: string, stage: string): Promise<ActionResult<null>> {
  try {
    if (!(INVESTOR_STAGES as readonly string[]).includes(stage)) {
      return { ok: false, error: 'Unknown stage.' };
    }
    const before = await one<{
      pitching_company_id: string | null; name: string; pipeline_stage: string; probability: number;
    }>(
      `select pitching_company_id, name, pipeline_stage, probability from investors
       where id = $1 and deleted_at is null`,
      [id],
    );
    if (!before?.pitching_company_id) return { ok: false, error: 'Investor not found.' };
    const actor = await requireInvestorWrite(before.pitching_company_id);

    const probability = STAGE_PROBABILITY[stage as InvestorStage];
    await sql(
      `update investors set pipeline_stage = $2, probability = $3,
         outreach_status = case
           when $2 in ('passed','not_a_fit') then 'closed'
           when $2 in ('researching','introduction_needed') then 'not_started'
           when $2 = 'ready_for_outreach' then 'queued'
           else 'in_progress' end
       where id = $1`,
      [id, stage, probability],
    );
    await recordActivity({
      actor, companyId: before.pitching_company_id, entityType: 'investor', entityId: id,
      action: 'stage_changed',
      summary: `Moved ${before.name} to ${stage.replace(/_/g, ' ')}`,
      meta: { from: before.pipeline_stage, to: stage },
    });
    revalidatePath('/investors');
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function bulkTagInvestorsAction(ids: string[], tagName: string): Promise<ActionResult<{ tagged: number }>> {
  try {
    const actor = await requireActor();
    if (!tagName.trim()) return { ok: false, error: 'Enter a tag name.' };
    let tag = await one<{ id: string }>(
      `select id from tags where lower(name) = lower($1) and company_id is null`, [tagName.trim()],
    );
    if (!tag) {
      tag = await one<{ id: string }>(
        `insert into tags (company_id, name, kind) values (null,$1,'investor') returning id`,
        [tagName.trim()],
      );
    }
    let tagged = 0;
    for (const id of ids.slice(0, 500)) {
      const investor = await one<{ pitching_company_id: string | null }>(
        `select pitching_company_id from investors where id = $1 and deleted_at is null`, [id],
      );
      if (!investor?.pitching_company_id) continue;
      if (!actor.can('investor:write', investor.pitching_company_id)) continue;
      await sql(
        `insert into taggings (tag_id, entity_type, entity_id) values ($1,'investor',$2)
         on conflict do nothing`,
        [tag!.id, id],
      );
      tagged++;
    }
    revalidatePath('/investors');
    return { ok: true, data: { tagged } };
  } catch (err) {
    return fail(err);
  }
}

export async function scheduleInvestorFollowUpAction(
  id: string,
  when: string,
): Promise<ActionResult<null>> {
  try {
    const at = new Date(when);
    if (Number.isNaN(at.getTime())) return { ok: false, error: 'Enter a valid date and time.' };
    const investor = await one<{ pitching_company_id: string | null; name: string; owner_user_id: string | null }>(
      `select pitching_company_id, name, owner_user_id from investors where id = $1 and deleted_at is null`,
      [id],
    );
    if (!investor?.pitching_company_id) return { ok: false, error: 'Investor not found.' };
    const actor = await requireInvestorWrite(investor.pitching_company_id);

    await sql(`update investors set next_follow_up_at = $2 where id = $1`, [id, at]);
    await sql(
      `insert into reminders (user_id, entity_type, entity_id, title, body, remind_at)
       values ($1,'investor',$2,$3,$4,$5)`,
      [
        investor.owner_user_id ?? actor.user.id, id, `Follow up with ${investor.name}`,
        'Scheduled from the investor pipeline.', at,
      ],
    );
    await recordActivity({
      actor, companyId: investor.pitching_company_id, entityType: 'investor', entityId: id,
      action: 'follow_up_scheduled', summary: `Scheduled a follow-up with ${investor.name}`,
    });
    revalidatePath('/investors');
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}
