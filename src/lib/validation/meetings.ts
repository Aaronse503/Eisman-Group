import { z } from 'zod';
import { optionalDate, optionalString, optionalUrl, optionalUuid } from './schemas';
import { MEETING_STATUSES } from '@/lib/domain/meetings';

export const meetingSchema = z
  .object({
    companyId: z.string().uuid('Choose a company'),
    title: z.string().trim().min(2, 'Give the meeting a title').max(300),
    template: z
      .enum([
        'general', 'client_call', 'sales_call', 'investor_call',
        'partnership_call', 'team_meeting', 'exec_review', 'product_meeting',
      ])
      .default('general'),
    startsAt: z.string().min(1, 'Choose a start time'),
    endsAt: z.string().min(1, 'Choose an end time'),
    timezone: z.string().trim().default('America/New_York'),
    location: optionalString,
    meetingUrl: optionalUrl,
    agenda: optionalString,
    notes: optionalString,
    decisions: optionalString,
    followUpDate: optionalDate,
    status: z.enum(MEETING_STATUSES).default('scheduled'),
    clientId: optionalUuid,
    projectId: optionalUuid,
    organizationId: optionalUuid,
    ownerUserId: optionalUuid,
    participantContactIds: z.array(z.string().uuid()).default([]),
    participantUserIds: z.array(z.string().uuid()).default([]),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
    message: 'The end time must be after the start time',
    path: ['endsAt'],
  });

export type MeetingInput = z.output<typeof meetingSchema>;

export const actionItemSchema = z.object({
  meetingId: z.string().uuid(),
  text: z.string().trim().min(2, 'Describe the action').max(500),
  ownerUserId: optionalUuid,
  dueDate: optionalDate,
});
