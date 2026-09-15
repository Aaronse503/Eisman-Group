export const TASK_STATUSES = [
  'backlog', 'todo', 'in_progress', 'blocked', 'in_review', 'done', 'cancelled',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Statuses shown on the board, in board order. */
export const BOARD_STATUSES = ['backlog', 'todo', 'in_progress', 'blocked', 'in_review', 'done'] as const;

export const TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const OPEN_STATUSES = TASK_STATUSES.filter((s) => s !== 'done' && s !== 'cancelled');

/** The saved views in the left rail of the tasks page. */
export const TASK_VIEWS = [
  { id: 'my', label: 'My tasks', description: 'Assigned to you and not finished' },
  { id: 'today', label: 'Today', description: 'Due today or already late' },
  { id: 'week', label: 'This week', description: 'Due in the next seven days' },
  { id: 'overdue', label: 'Overdue', description: 'Past the due date and still open' },
  { id: 'delegated', label: 'Delegated', description: 'You assigned these to someone else' },
  { id: 'waiting', label: 'Waiting on', description: 'Blocked on somebody or something' },
  { id: 'recurring', label: 'Recurring', description: 'Tasks that repeat on a schedule' },
  { id: 'personal', label: 'Personal', description: 'Your own executive to-dos' },
  { id: 'unassigned', label: 'Unassigned', description: 'Open work with no owner' },
  { id: 'all', label: 'All open', description: 'Everything not yet finished' },
  { id: 'completed', label: 'Completed', description: 'Recently finished work' },
] as const;

export type TaskViewId = (typeof TASK_VIEWS)[number]['id'];

export interface TaskRow {
  id: string;
  company_id: string;
  company_name: string;
  project_id: string | null;
  project_name: string | null;
  client_id: string | null;
  client_name: string | null;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignee_user_id: string | null;
  assignee_name: string | null;
  delegated_by_id: string | null;
  delegated_by_name: string | null;
  waiting_on: string | null;
  start_at: Date | null;
  due_at: Date | null;
  completed_at: Date | null;
  estimate_hours: number | null;
  is_personal: boolean;
  recurrence_rule: string | null;
  external_source: string | null;
  external_url: string | null;
  subtask_count: number;
  subtasks_done: number;
  blocked_by: number;
  is_demo: boolean;
  created_at: Date;
}

/** Human-readable summary of the small RRULE subset this app supports. */
export function describeRecurrence(rule: string | null): string | null {
  if (!rule) return null;
  const freq = /FREQ=(\w+)/.exec(rule)?.[1]?.toLowerCase();
  const interval = Number(/INTERVAL=(\d+)/.exec(rule)?.[1] ?? '1');
  const byDay = /BYDAY=([A-Z,]+)/.exec(rule)?.[1];
  if (!freq) return rule;
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[freq] ?? freq;
  const every = interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`;
  const days: Record<string, string> = {
    MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat', SU: 'Sun',
  };
  return byDay ? `${every} on ${byDay.split(',').map((d) => days[d] ?? d).join(', ')}` : every;
}

export const RECURRENCE_PRESETS = [
  { value: '', label: 'Does not repeat' },
  { value: 'FREQ=DAILY', label: 'Every day' },
  { value: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', label: 'Every weekday' },
  { value: 'FREQ=WEEKLY', label: 'Every week' },
  { value: 'FREQ=WEEKLY;INTERVAL=2', label: 'Every two weeks' },
  { value: 'FREQ=MONTHLY', label: 'Every month' },
  { value: 'FREQ=MONTHLY;INTERVAL=3', label: 'Every quarter' },
  { value: 'FREQ=YEARLY', label: 'Every year' },
] as const;
