import { z } from 'zod';
import { PUBLICATION_IDS } from '@/lib/publications';

const nullableUrl = z.string().trim().url().max(2_000).nullable().optional().or(z.literal(''));
const nullableShortText = z.string().trim().max(300).nullable().optional();

export const testimonialInputSchema = z.object({
  quote: z.string().trim().min(10).max(5_000),
  clientName: z.string().trim().min(2).max(200),
  clientTitle: nullableShortText,
  clientCompany: nullableShortText,
  rating: z.number().int().min(1).max(5).nullable().optional(),
  format: z.enum(['text', 'video']),
  videoUrl: nullableUrl,
  imageUrl: nullableUrl,
  transcript: z.string().trim().max(10_000).nullable().optional(),
  sourceUrl: nullableUrl,
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  markets: z.array(z.enum(PUBLICATION_IDS)).max(PUBLICATION_IDS.length).default([]),
  isGlobal: z.boolean().default(false),
  status: z.enum(['pending', 'published', 'archived']).default('pending'),
  sortOrder: z.number().int().min(0).max(100_000).default(0),
}).superRefine((value, ctx) => {
  if (!value.isGlobal && value.markets.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['markets'],
      message: 'Select at least one market or mark the testimonial global.',
    });
  }
  if (value.format === 'video' && !value.videoUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['videoUrl'],
      message: 'A video URL is required for video testimonials.',
    });
  }
});

export const publicTestimonialSubmissionSchema = testimonialInputSchema
  .omit({ status: true, sortOrder: true })
  .extend({
    email: z.string().trim().email().max(320).optional().or(z.literal('')),
    consent: z.literal(true),
    hp: z.string().optional(),
  });

export const testimonialProfileSchema = z.object({
  display_name: z.string().trim().min(2).max(200),
  professional_title: nullableShortText,
  company: nullableShortText,
  bio: z.string().trim().max(2_000).nullable().optional(),
  headshot_url: nullableUrl,
  default_market: z.enum(PUBLICATION_IDS),
  default_global: z.boolean(),
  is_published: z.boolean(),
});

export const adminTestimonialPatchSchema = z.object({
  status: z.enum(['pending', 'published', 'archived']),
  markets: z.array(z.enum(PUBLICATION_IDS)).max(PUBLICATION_IDS.length),
  isGlobal: z.boolean(),
  sortOrder: z.number().int().min(0).max(100_000),
}).superRefine((value, ctx) => {
  if (!value.isGlobal && value.markets.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['markets'],
      message: 'Select at least one market or mark the testimonial global.',
    });
  }
});

export function nullableValue(value: string | null | undefined): string | null {
  return value && value.trim() ? value.trim() : null;
}
