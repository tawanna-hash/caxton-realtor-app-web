/**
 * Zod schemas shared by giveaways routes.
 */

import { z } from 'zod';

export const createGiveawaySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  prize: z.string().min(1).max(500),
  publication: z.enum(['austin', 'san_antonio', 'both']),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  drawAt: z.string().datetime().optional(),
});

export const updateGiveawaySchema = createGiveawaySchema.partial().extend({
  status: z.enum(['draft', 'active', 'closed', 'announced']).optional(),
});

export const ruleSchema = z.object({
  actionType: z.enum([
    'signup',
    'follow_facebook',
    'follow_instagram',
    'follow_linkedin',
    'follow_twitter',
    'subscribe_list',
    'custom',
  ]),
  label: z.string().min(1).max(200),
  targetUrl: z.string().url().optional().nullable(),
  tickets: z.number().int().min(1).max(100).default(1),
  sortOrder: z.number().int().min(0).default(0),
  required: z.boolean().default(false),
  // Optional ISO datetime cutoff. When set, the auto-enroll only fires
  // for signups that happen before this moment (early-bird bonus entries).
  deadlineAt: z.string().datetime().optional().nullable(),
});

export const giveawayIdParamSchema = z.object({ id: z.string().uuid() });

export const ruleIdParamSchema = z.object({
  id: z.string().uuid(),
  ruleId: z.string().uuid(),
});

export type CreateGiveawayInput = z.infer<typeof createGiveawaySchema>;
export type UpdateGiveawayInput = z.infer<typeof updateGiveawaySchema>;
export type RuleInput = z.infer<typeof ruleSchema>;
