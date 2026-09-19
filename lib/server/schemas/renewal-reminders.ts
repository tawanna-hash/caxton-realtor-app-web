// lib/server/schemas/renewal-reminders.ts
//
// Zod schemas for /api/admin/renewal-reminders/* routes.

import { z } from 'zod';

const renewalReminderStatusSchema = z.enum(['Pending', 'Completed', 'Dismissed']);

export const renewalReminderListQuerySchema = z.object({
  status: renewalReminderStatusSchema.optional(),
});

const nullableString = z.string().max(500).nullish();
const isoDateOrNull = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, 'must be ISO date (YYYY-MM-DD)')
  .nullish();

export const renewalReminderCreateSchema = z.object({
  agreement_id: z.string().uuid(),
  company_name: nullableString,
  rep_name: nullableString,
  email: z.string().email().nullish(),
  ad_size: nullableString,
  frequency: nullableString,
  ad_rate_cents: z.number().int().nonnegative().nullish(),
  exp_date: isoDateOrNull,
  remind_date: isoDateOrNull,
  note: nullableString,
});

export const renewalReminderPatchSchema = z.object({
  status: renewalReminderStatusSchema.optional(),
  note: z.string().nullish(),
  remind_date: isoDateOrNull,
}).refine(
  (b) => b.status !== undefined || b.note !== undefined || b.remind_date !== undefined,
  { message: 'no patchable fields provided' },
);

export const renewalReminderSendBodySchema = z.object({
  to: z.string().email().optional(),
  complete: z.boolean().optional(),
});
