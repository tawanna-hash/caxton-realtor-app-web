/**
 * Shared zod schemas for the admin events routes.
 */

import { z } from 'zod';
import { PUBLICATION_IDS } from '@/lib/publications';

export const publicationSchema = z.enum(PUBLICATION_IDS);

export const eventPersonSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.union([z.string().trim().email(), z.literal('')]).optional().nullable(),
  company: z.string().trim().max(300).optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
});

export const eventScheduleItemSchema = z.object({
  time: z.string().trim().max(100),
  title: z.string().trim().min(1).max(300),
  details: z.string().trim().max(2000),
});

export const eventSpeakerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  title: z.string().trim().max(300),
  company: z.string().trim().max(300),
  bio: z.string().trim().max(5000),
});

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
  advertiserIds: z.array(z.number().int().positive()).optional(),
  additionalHosts: z.array(eventPersonSchema).max(20).optional(),
  additionalInstructors: z.array(eventPersonSchema).max(20).optional(),
  schedule: z.array(eventScheduleItemSchema).max(50).optional(),
  speakers: z.array(eventSpeakerSchema).max(50).optional(),
});

export const updateEventInputSchema = manualEventInputSchema.partial();

export const eventIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
