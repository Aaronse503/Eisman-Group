import { sql } from '@/lib/db/client';
import { upsertMapped } from '../mapping';
import {
  providerFetch,
  IntegrationError,
  type ConnectionTest,
  type FieldMappingProposal,
  type IntegrationAdapter,
  type SyncContext,
  type SyncResult,
} from '../types';

const API = 'https://api.clickup.com/api/v2';

interface ClickUpTask {
  id: string;
  name: string;
  description?: string | null;
  status?: { status: string; type?: string } | null;
  priority?: { priority: string } | null;
  due_date?: string | null;
  start_date?: string | null;
  date_closed?: string | null;
  url?: string;
  parent?: string | null;
  assignees?: { id: number; username?: string; email?: string }[];
  list?: { id: string; name: string } | null;
  folder?: { id: string; name: string } | null;
  space?: { id: string; name: string } | null;
}

/** ClickUp status buckets map onto this system's task statuses. */
function mapStatus(task: ClickUpTask): string {
  const raw = (task.status?.status ?? '').toLowerCase();
  const type = task.status?.type;
  if (type === 'closed' || task.date_closed) return 'done';
  if (raw.includes('block')) return 'blocked';
  if (raw.includes('review')) return 'in_review';
  if (raw.includes('progress') || raw.includes('doing') || raw.includes('active')) return 'in_progress';
  if (raw.includes('backlog') || raw.includes('idea')) return 'backlog';
  if (raw.includes('cancel')) return 'cancelled';
  return 'todo';
}

function mapPriority(task: ClickUpTask): string {
  switch ((task.priority?.priority ?? '').toLowerCase()) {
    case 'urgent':
      return 'urgent';
    case 'high':
      return 'high';
    case 'low':
      return 'low';
    default:
      return 'normal';
  }
}

const toDate = (ms?: string | null) => (ms ? new Date(Number(ms)) : null);

/** Deterministic demo fixtures, clearly labelled as demo when written. */
function demoTasks(): ClickUpTask[] {
  const base = Date.now();
  const names = [
    ['Launch Q4 paid media flight', 'in progress', 'high'],
    ['Rebuild the client reporting template', 'to do', 'normal'],
    ['Creative refresh — Northwind', 'in review', 'urgent'],
    ['Technical SEO crawl and fix list', 'to do', 'normal'],
    ['Migrate tracking to server-side', 'blocked', 'high'],
    ['Quarterly business review deck', 'complete', 'normal'],
  ] as const;
  return names.map(([name, status, priority], i) => ({
    id: `demo-cu-${i + 1}`,
    name,
    description: 'Imported from ClickUp demo mode. Not a real ClickUp record.',
    status: { status, type: status === 'complete' ? 'closed' : 'custom' },
    priority: { priority },
    due_date: String(base + (i - 2) * 86_400_000 * 3),
    url: `https://app.clickup.com/t/demo-cu-${i + 1}`,
    list: { id: 'demo-list-1', name: 'Client Delivery' },
    folder: { id: 'demo-folder-1', name: 'Eisman Digital' },
    space: { id: 'demo-space-1', name: 'Agency Operations' },
    assignees: [],
  }));
}

export const clickupAdapter: IntegrationAdapter = {
  id: 'clickup',

  async test(credentials) {
    const token = credentials.apiToken;
    const teamId = credentials.teamId;
    if (!token) throw new IntegrationError('A ClickUp API token is required.');
    const user = (await providerFetch(`${API}/user`, {
      headers: { Authorization: token },
    })) as { user?: { username?: string; email?: string; id?: number } };
    const teams = (await providerFetch(`${API}/team`, {
      headers: { Authorization: token },
    })) as { teams?: { id: string; name: string }[] };
    const team = teams.teams?.find((t) => t.id === teamId);
    if (teamId && !team) {
      return {
        ok: false,
        message: `The token is valid, but workspace ${teamId} is not visible to it.`,
        detail: `Visible workspaces: ${teams.teams?.map((t) => `${t.name} (${t.id})`).join(', ') || 'none'}`,
      };
    }
    return {
      ok: true,
      accountName: team ? `${team.name} — ${user.user?.username ?? user.user?.email ?? ''}`.trim() : user.user?.username,
      accountId: teamId ?? String(user.user?.id ?? ''),
      scopes: ['read:tasks', 'read:lists', 'read:spaces'],
      message: 'Connected to ClickUp.',
    } satisfies ConnectionTest;
  },

  async proposeFieldMappings() {
    const rows: FieldMappingProposal[] = [
      { entityType: 'task', sourceField: 'name', targetField: 'title', sourceOfTruth: 'remote' },
      { entityType: 'task', sourceField: 'description', targetField: 'description', sourceOfTruth: 'remote' },
      { entityType: 'task', sourceField: 'status.status', targetField: 'status', sourceOfTruth: 'remote', note: 'Mapped through a status bucket table.' },
      { entityType: 'task', sourceField: 'priority.priority', targetField: 'priority', sourceOfTruth: 'remote' },
      { entityType: 'task', sourceField: 'due_date', targetField: 'due_at', sourceOfTruth: 'remote' },
      { entityType: 'task', sourceField: 'assignees[0].email', targetField: 'assignee_user_id', sourceOfTruth: 'remote', note: 'Matched by email against local users; unmatched assignees are left unset.' },
      { entityType: 'task', sourceField: 'url', targetField: 'external_url', sourceOfTruth: 'remote' },
      { entityType: 'task', sourceField: 'list.name', targetField: 'project_id', sourceOfTruth: 'manual', note: 'Requires a space/list → company + client mapping before tasks are attributed.' },
      { entityType: 'task', sourceField: '—', targetField: 'client_id', sourceOfTruth: 'local', note: 'Client attribution is owned locally and never overwritten by a sync.' },
    ];
    return rows;
  },

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const log: SyncResult['log'] = [];
    const push = (level: 'info' | 'warn' | 'error', message: string) => {
      log.push({ level, message, at: new Date().toISOString() });
      ctx.log(level, message);
    };

    if (!ctx.companyId) {
      throw new IntegrationError('ClickUp must be connected to a specific company.');
    }

    let tasks: ClickUpTask[];
    if (ctx.demo) {
      tasks = demoTasks();
      push('info', 'Demo mode: using built-in ClickUp fixtures. No ClickUp request was made.');
    } else {
      const token = ctx.credentials.apiToken;
      const teamId = ctx.credentials.teamId;
      if (!token || !teamId) throw new IntegrationError('ClickUp token and workspace id are required.');
      const spaces = (await providerFetch(`${API}/team/${teamId}/space?archived=false`, {
        headers: { Authorization: token },
      })) as { spaces?: { id: string; name: string }[] };
      push('info', `Found ${spaces.spaces?.length ?? 0} space(s).`);

      tasks = [];
      for (const space of spaces.spaces ?? []) {
        const lists = (await providerFetch(`${API}/space/${space.id}/list?archived=false`, {
          headers: { Authorization: token },
        })) as { lists?: { id: string; name: string }[] };
        for (const list of lists.lists ?? []) {
          const page = (await providerFetch(
            `${API}/list/${list.id}/task?subtasks=true&include_closed=true`,
            { headers: { Authorization: token } },
          )) as { tasks?: ClickUpTask[] };
          tasks.push(...(page.tasks ?? []));
        }
      }
      push('info', `Read ${tasks.length} task(s) from ClickUp.`);
    }

    // Build an email → local user map so assignees resolve where possible.
    const users = await sql<{ id: string; email: string }>(`select id, email from users`);
    const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));

    let written = 0;
    let conflicts = 0;
    let unmatchedAssignees = 0;
    const localIdByExternal = new Map<string, string>();

    // Parents before children so subtask links resolve.
    const ordered = [...tasks].sort((a, b) => (a.parent ? 1 : 0) - (b.parent ? 1 : 0));

    for (const task of ordered) {
      const assigneeEmail = task.assignees?.[0]?.email?.toLowerCase();
      const assigneeId = assigneeEmail ? (byEmail.get(assigneeEmail) ?? null) : null;
      if (assigneeEmail && !assigneeId) unmatchedAssignees++;

      const result = await upsertMapped({
        connectionId: ctx.connection.id,
        provider: 'clickup',
        entityType: 'task',
        externalId: task.id,
        table: 'tasks',
        values: {
          company_id: ctx.companyId,
          title: task.name,
          description: task.description ?? null,
          status: mapStatus(task),
          priority: mapPriority(task),
          assignee_user_id: assigneeId,
          due_at: toDate(task.due_date),
          start_at: toDate(task.start_date),
          completed_at: toDate(task.date_closed),
          parent_task_id: task.parent ? (localIdByExternal.get(task.parent) ?? null) : null,
          external_source: 'clickup',
          external_id: task.id,
          external_url: task.url ?? null,
          external_synced_at: new Date(),
          is_demo: ctx.demo,
        },
        matchOn: [
          { column: 'external_source', value: 'clickup' },
          { column: 'external_id', value: task.id },
        ],
        // Client attribution and personal flags are owned here, not in ClickUp.
        localOwnedColumns: ['client_id', 'project_id', 'is_personal'],
      });
      localIdByExternal.set(task.id, result.id);
      if (result.action === 'conflict') conflicts++;
      else written++;
    }

    if (unmatchedAssignees) {
      push(
        'warn',
        `${unmatchedAssignees} assignee(s) had no matching user in this system and were left unassigned.`,
      );
    }
    if (conflicts) {
      push('warn', `${conflicts} task(s) changed on both sides and were flagged as conflicts rather than overwritten.`);
    }
    push('info', `Wrote ${written} task(s).`);

    return {
      recordsRead: tasks.length,
      recordsWritten: written,
      conflicts,
      log,
      warnings: conflicts ? [`${conflicts} conflict(s) need review.`] : undefined,
    };
  },
};
