import { authed, notFound, forbidden } from '@/lib/api/route';
import { getClient, getClientContacts } from '@/lib/queries/crm';
import { sql } from '@/lib/db/client';

/** One client, with the pieces a phone screen shows. */
export const GET = authed(async ({ actor, route }) => {
  const client = await getClient(route.id!);
  if (!client) throw notFound('Client');
  if (!actor.canReadCompany(client.company_id)) throw forbidden();

  const [contacts, notes, tasks] = await Promise.all([
    getClientContacts(client.id),
    sql<{ id: string; title: string; body: string; created_at: Date; author_name: string | null; is_demo: boolean }>(
      `select n.id, n.title, n.body, n.created_at, u.name as author_name, n.is_demo
       from notes n left join users u on u.id = n.author_user_id
       where n.entity_type = 'client' and n.entity_id = $1 and n.deleted_at is null
       order by n.pinned desc, n.created_at desc limit 10`,
      [client.id],
    ),
    sql<{ id: string; title: string; status: string; due_at: Date | null; is_demo: boolean }>(
      `select id, title, status, due_at, is_demo from tasks
       where client_id = $1 and deleted_at is null and status not in ('done','cancelled')
       order by due_at nulls last limit 10`,
      [client.id],
    ),
  ]);

  return {
    client: {
      id: client.id,
      name: client.name,
      status: client.status,
      stage: client.stage,
      healthScore: client.health_score,
      monthlyRetainer: Number(client.monthly_retainer ?? 0),
      companyName: client.company_name,
      companyId: client.company_id,
      ownerName: client.owner_name,
      website: client.website,
      renewalDate: client.renewal_date,
      nextAction: client.next_action,
      risks: client.risks,
      goals: client.goals,
      openTasks: client.open_tasks,
      outstanding: Number(client.outstanding ?? 0),
      isDemo: client.is_demo,
    },
    contacts: contacts.map((c) => ({
      id: c.id,
      fullName: c.full_name,
      title: c.title,
      email: c.email,
      phone: c.phone,
    })),
    notes: notes.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      authorName: n.author_name,
      createdAt: new Date(n.created_at).toISOString(),
      isDemo: n.is_demo,
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      dueAt: t.due_at ? new Date(t.due_at).toISOString() : null,
      isDemo: t.is_demo,
    })),
  };
});
