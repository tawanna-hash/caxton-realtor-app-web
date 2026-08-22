/**
 * Zod schemas shared by ads routes.
 */

import { z } from 'zod';

const publicationSchema = z.enum(['austin', 'san_antonio', 'both']);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

// Strip whitespace anywhere in a click destination. Browsers refuse to
// dispatch malformed mailto: URIs with a space after the scheme (e.g.
// 'mailto: ads@...'), which silently breaks the inquire flow.
const clickUrlSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/^(mailto|tel|https?):\s+/i, '$1:'))
  .refine((s) => /^(https?:\/\/|mailto:|tel:)/i.test(s) && !/\s/.test(s), {
    message: 'click_url must be a valid http(s), mailto:, or tel: URL with no whitespace',
  });

export const createCreativeSchema = z.object({
  advertiser_name: z.string().min(1).max(200),
  blob_url: z.string().url(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  click_url: clickUrlSchema,
  alt_text: z.string().max(500).nullable(),
});

export const updateCreativeSchema = z.object({
  advertiser_name: z.string().min(1).max(200).optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  click_url: clickUrlSchema.optional(),
  alt_text: z.string().max(500).nullable().optional(),
});

export const createCampaignSchema = z.object({
  advertiser_name: z.string().min(1).max(200),
  ad_space_slug: z.string().min(1),
  creative_id: z.string().uuid(),
  publication: publicationSchema,
  start_date: isoDate,
  end_date: isoDate,
  price_total: z.number().nullable(),
  price_notes: z.string().max(500).nullable(),
  notes: z.string().max(2000).nullable(),
});

export const updateCampaignSchema = createCampaignSchema.partial();

export const idParamSchema = z.object({ id: z.string().uuid() });
