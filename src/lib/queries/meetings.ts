import { sql, one } from '@/lib/db/client';
import type { MeetingRow } from '@/lib/domain/meetings';

export type { MeetingRow };

const SELECT = `
  select m.*, co.name as company_name, cl.name as client_name, u.name as owner_name,
         cal.name as calendar_name,
         (select count(*)::int from meeting_participants p where p.meeting_id = m.id) as participant_count,
         (select count(*)::int from action_items a where a.meeting_id = m.id) as action_item_count,
         (select count(*)::int from action_items a where a.meeting_id = m.id and not a.done) as open_action_items
  from meetings m
  join companies co on co.id = m.company_id
  left join clients cl on cl.id = m.client_id
  left join users u on u.id = m.owner_user_id
  left join calendars cal on cal.id = m.calendar_id`;

export async function listMeetings(opts: {
  companyIds: string[];
  from?: Date;
  to?: Date;
  clientId?: string;
  status?: string;
  template?: string;
  limit?: number;
}): Promise<MeetingRow[]> {
  if (!opts.companyIds.length) return [];
  const params: unknown[] = [opts.companyIds];
  const where = ['m.company_id = any($1)', 'm.deleted_at is null'];
  if (opts.from) {
    params.push(opts.from);
    where.push(`m.ends_at >= $${params.length}`);
  }
  if (opts.to) {
    params.push(opts.to);
    where.push(`m.starts_at <= $${params.length}`);
  }
  if (opts.clientId) {
    params.push(opts.clientId);
    where.push(`m.client_id = $${params.length}`);
  }
  if (opts.status) {
    params.push(opts.status);
    where.push(`m.status = $${params.length}`);
  }
  if (opts.template) {
    params.push(opts.template);
    where.push(`m.template = $${params.length}`);
  }
  return sql<MeetingRow>(
    `${SELECT} where ${where.join(' and ')} order by m.starts_at limit ${Math.min(opts.limit ?? 400, 1000)}`,
    params,
  );
}

export async function getMeeting(id: string) {
  const meeting = await one<MeetingRow & { company_slug: string; owner_user_id: string | null }>(
    `${SELECT.replace('left join calendars cal on cal.id = m.calendar_id', 'left join calendars cal on cal.id = m.calendar_id')}
     where m.id = $1 and m.deleted_at is null`,
    [id],
  );
  if (!meeting) return null;
  const slug = await one<{ slug: string }>(`select slug from companies where id = $1`, [meeting.company_id]);
  return { ...meeting, company_slug: slug?.slug ?? '' };
}

export async function getParticipants(meetingId: string) {
  return sql<{
    id: string; name: string | null; email: string | null; response: string;
    is_organizer: boolean; user_id: string | null; contact_id: string | null;
  }>(
    `select p.id,
            coalesce(p.name, u.name, trim(c.first_name || ' ' || coalesce(c.last_name,''))) as name,
            coalesce(p.email, u.email, c.email) as email,
            p.response, p.is_organizer, p.user_id, p.contact_id
     from meeting_participants p
     left join users u on u.id = p.user_id
     left join contacts c on c.id = p.contact_id
     where p.meeting_id = $1
     order by p.is_organizer desc, name`,
    [meetingId],
  );
}

export async function getActionItems(meetingId: string) {
  return sql<{
    id: string; text: string; due_date: string | null; done: boolean;
    owner_user_id: string | null; owner_name: string | null; task_id: string | null;
  }>(
    `select a.id, a.text, a.due_date, a.done, a.owner_user_id, u.name as owner_name, a.task_id
     from action_items a left join users u on u.id = a.owner_user_id
     where a.meeting_id = $1 order by a.position, a.created_at`,
    [meetingId],
  );
}

export async function getUpcomingActionItems(companyIds: string[], userId: string) {
  if (!companyIds.length) return [];
  return sql<{
    id: string; text: string; due_date: string | null; meeting_id: string | null;
    meeting_title: string | null; task_id: string | null;
  }>(
    `select a.id, a.text, a.due_date, a.meeting_id, m.title as meeting_title, a.task_id
     from action_items a
     left join meetings m on m.id = a.meeting_id
     where a.company_id = any($1) and not a.done
       and (a.owner_user_id = $2 or a.owner_user_id is null)
     order by a.due_date nulls last limit 25`,
    [companyIds, userId],
  );
}
