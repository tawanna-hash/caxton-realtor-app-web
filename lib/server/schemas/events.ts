/**
 * Shared zod schemas for the admin events routes.
 */

import { z } from 'zod';
import { PUBLICATION_IDS } from '@/lib/publications';

export const publicationSchema = z.enum(PUBLICATION_IDS);

export const manualEventInputSchema = z.object({
  publication: publicationSchema,
  title: z.string().min(1).max(500),
  description: z.string().optional().nullable(),
  link: z.string().url().optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  location: z.string().max(500).optional().nullable(),
  organizer: z.string().max(500).optional().nullable(),
  organizerEmail: z.string().email().optional().nullable(),
  website: z.string().url().optional().nullable(),
  tags: z.string().optional().nullable(),
  format: z.string().max(100).optional().nullable(),
  courseNumber: z.string().max(100).optional().nullable(),
  memberPrice: z.string().max(100).optional().nullable(),
  nonmemberPrice: z.string().max(100).optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  imageThumb: z.string().url().optional().nullable(),
  instructorName: z.string().max(200).optional().nullable(),
  instructorBio: z.string().optional().nullable(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
});

export const updateEventInputSchema = manualEventInputSchema.partial();

export const eventIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
