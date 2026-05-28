/**
 * Zod schemas shared by ads routes.
 */

import { z } from 'zod';

export const publicationSchema = z.enum(['austin', 'san_antonio', 'both']);
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const createCreativeSchema = z.object({
  advertiser_name: z.string().min(1).max(200),
  blob_url: z.string().url(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  click_url: z.string().url(),
  alt_text: z.string().max(500).nullable(),
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
