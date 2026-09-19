// lib/server/schemas/marketing-outreach.ts
//
// Zod schemas for the full marketing email composer pipeline:
//   - audience preview payload (multi-source)
//   - outreach send / test / schedule payloads
//   - cron dispatch acknowledgement
//
// All endpoints live under /api/admin/marketing-campaigns/*.

import { z } from 'zod';
import { PUB_ACTIVE } from '@/lib/publications';

// ── Audience source ────────────────────────────────────────────────
const audienceSourceSchema = z.enum(['advertisers', 'subscribers', 'manual', 'segment']);

// Filter for the live audience preview. Mirrors AudienceFilter in
// lib/marketing-campaigns.ts but represented as zod for inbound POST bodies.
const audienceFilterSchema = z.object({
  status: z.array(z.string()).optional(),
  type: z.array(z.string()).optional(),
  publication: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  industry: z.array(z.string()).optional(),
  has_active_agreement: z.boolean().optional(),
  no_agreement_in_days: z.number().int().positive().max(3650).optional(),
}).partial();

const subscriberFilterSchema = z.object({
  publication: z.enum(PUB_ACTIVE.map((publication) => publication.id) as [
    'realtyline',
    ...Array<'newsline' | 'realtyline-houston' | 'realtyline-dallas'>,
  ]).optional(),
  status: z.enum(['active', 'unsubscribed']).optional(),
  verified: z.enum(['valid', 'invalid', 'risky', 'unknown', 'pending', 'unverified']).optional(),
}).partial();

// Email regex (RFC 5322-lite, good enough for opt-in marketing entry).
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Email attachment payload (remote Vercel Blob URL) ─────────────
// The client uploads each file directly to Vercel Blob (bypassing the
// 4.5MB Vercel-route ingress cap), then posts only the resulting URLs
// here. Server-side, fetchBlobAttachments() re-fetches each URL and
// converts to Resend's base64 shape.
const emailAttachmentSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  url: z.string().url().max(2000),
  content_type: z.string().trim().max(200).optional(),
});
export const audiencePreviewSchema = z.object({
  sources: z.array(audienceSourceSchema).min(1, 'pick at least one source'),
  advertiser_filter: audienceFilterSchema.optional(),
  subscriber_filter: subscriberFilterSchema.optional(),
  manual_emails: z.array(z.string().regex(emailRe, 'invalid email')).max(2000).optional(),
});
// ── Compose payload (used by send / schedule / test) ───────────────
const composeSchema = z.object({
  subject:      z.string().trim().min(1, 'subject required').max(998),
  body:         z.string().trim().min(1, 'body required').max(200_000),
  from_name:    z.string().trim().max(120).optional(),
  reply_to:     z.string().regex(emailRe, 'invalid reply-to email').optional(),
  reply_to_list: z.array(z.string().regex(emailRe, 'invalid reply-to email')).max(10).optional(),
  preview_text: z.string().trim().max(150).optional(),
  attachments:  z.array(emailAttachmentSchema).max(20).optional(),
  attachment_link_url:   z.string().url().max(2000).optional(),
  attachment_link_label: z.string().trim().max(120).optional(),
}).strict();

export const sendOutreachSchema = composeSchema.extend({
  sources: z.array(audienceSourceSchema).min(1),
  advertiser_filter: audienceFilterSchema.optional(),
  subscriber_filter: subscriberFilterSchema.optional(),
  manual_emails: z.array(z.string().regex(emailRe)).max(2000).optional(),
  mode: z.enum(['send_now', 'schedule']).default('send_now'),
  scheduled_for: z.string().datetime({ offset: true }).optional(),
  recurrence_interval_days: z.number().int().positive().max(365).optional(),
  recurrence_until: z.string().datetime({ offset: true }).optional(),
}).strict().refine(
  (v) => v.mode !== 'schedule' || !!v.scheduled_for,
  { message: 'scheduled_for required when mode=schedule', path: ['scheduled_for'] },
);
export const testSendSchema = composeSchema.extend({
  to: z.string().regex(emailRe, 'invalid email'),
}).strict();
