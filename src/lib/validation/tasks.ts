import { z } from 'zod';
import { optionalDateTime, optionalString, optionalUuid } from './schemas';
import { TASK_PRIORITIES, TASK_STATUSES } from '@/lib/domain/tasks';

export const taskSchema = z.object({
  companyId: z.string().uuid('Choose a company'),
  title: z.string().trim().min(2, 'Give the task a title').max(300),
  description: optionalString,
  status: z.enum(TASK_STATUSES).default('todo'),
  priority: z.enum(TASK_PRIORITIES).default('normal'),
  assigneeUserId: optionalUuid,
  clientId: optionalUuid,
  projectId: optionalUuid,
  parentTaskId: optionalUuid,
  waitingOn: optionalString,
  startAt: optionalDateTime,
  dueAt: optionalDateTime,
  estimateHours: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((v) => {
      if (v === '' || v === undefined || v === null) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }),
  isPersonal: z.coerce.boolean().default(false),
  recurrenceRule: optionalString,
});

export type TaskInput = z.output<typeof taskSchema>;

export const quickTaskSchema = z.object({
  companyId: z.string().uuid(),
  title: z.string().trim().min(2).max(300),
  dueAt: optionalDateTime,
  assigneeUserId: optionalUuid,
  clientId: optionalUuid,
});
