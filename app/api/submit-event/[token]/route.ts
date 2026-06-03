/**
 * POST /api/submit-event/[token]
 * GET  /api/submit-event/[token]
 *
 * PUBLIC (no admin auth) — gated solely by the advertiser's submission_token.
 *
 * Flow:
 *   1. Admin generates submission_token for an advertiser via the CRM UI.
 *   2. Admin shares the resulting URL with the advertiser (one-time setup).
 *   3. Advertiser fills the public form at /submit-event/[token] which calls
 *      this endpoint.
 *   4. We insert a row into `events` with hidden=true, external_source='submission',
 *      and submitted_by_advertiser_id pointing back to the advertiser.
 *   5. Admin sees it in /admin/events/pending and approves (sets hidden=false).
 *
 * GET is provided so the form can fetch a friendly advertiser-name banner
 * (\"Submitting on behalf of {Austin Title}\") and 404 cleanly on bad tokens
 * before showing the form.
 *
 * Light rate-limit (per-token, in-memory) so a leaked token can't be used
 * to flood the events table. This is intentionally simple — proper rate
 * limiting belongs at the edge if it ever becomes a real concern.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSql } from '@/lib/db';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { createSubmittedEvent } from '@/lib/server/events-store';
import { notifyAdminsPendingEvent } from '@/lib/server/event-pending-notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Tiny per-token rate limiter ───────────────────────────────────────
// Map<token, timestamps[]>. Keeps the last 10 timestamps per token; rejects
// if 5+ submissions occurred in the last 60s. Module-level Map survives
// across requests within the same lambda instance — that's the realistic
// abuse boundary for a small admin tool. Lambdas cold-start frequently so
// determined abusers can still bypass, but the goal is just typo / replay
// prevention, not adversarial defense.
const RECENT_HITS = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;

function recordHitAndCheck(token: string): boolean {
  const now = Date.now();
  const list = (RECENT_HITS.get(token) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  RECENT_HITS.set(token, list);
  return list.length <= MAX_PER_WINDOW;
}

// ─── Input validation ──────────────────────────────────────────────────
// Loosely typed since we're dealing with a public form — anything the
// advertiser pastes in needs sanity checks but we don't want to be so
// strict that legit submissions get rejected. Dates are accepted as
// either ISO strings or 'YYYY-MM-DDTHH:mm' (datetime-local format).
const submitEventSchema = z.object({
  title: z.string().trim().min(2).max(500),
  description: z.string().trim().max(5_000).optional().nullable(),
  startDate: z.string().trim().min(1),
  endDate: z.string().trim().optional().nullable(),
  location: z.string().trim().max(500).optional().nullable(),
  website: z
    .string()
    .trim()
    .url()
    .max(1_000)
    .optional()
    .nullable()
    .or(z.literal('')),
  rsvpLink: z
    .string()
    .trim()
    .url()
    .max(1_000)
    .optional()
    .nullable()
    .or(z.literal('')),
  imageUrl: z
    .string()
    .trim()
    .url()
    .max(1_000)
    .optional()
    .nullable()
    .or(z.literal('')),
  // Honeypot: a hidden form field bots love to fill. Real users leave it
  // empty. Non-empty submissions are silently 200'd so bots don't learn.
  hp: z.string().optional(),
});

/**
 * Parses a string the form could send us — either an ISO timestamp or a
 * datetime-local value (\"YYYY-MM-DDTHH:mm\"). Returns the normalized ISO
 * string or null when not provided. Throws on garbage.
 */
function parseDateInput(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    throw new ApiError(400, `Invalid date: \"${trimmed}\"`);
  }
  return d.toISOString();
}

// ─── Token lookup ──────────────────────────────────────────────────────
// Pulled into a helper so GET + POST share the exact same 404 semantics.
async function findAdvertiserByToken(token: string) {
  const sql = getSql();
  const trimmed = (token ?? '').trim();
  if (!trimmed) return null;
  const rows = (await sql`
    SELECT id, name, publication
    FROM advertisers
    WHERE submission_token = ${trimmed}
    LIMIT 1
  `) as unknown as Array<{
    id: number;
    name: string;
    publication: string | null;
  }>;
  return rows[0] ?? null;
}

type Ctx = { params: Promise<{ token: string }> };

// ─── GET: friendly advertiser preview for the form ─────────────────────
export const GET = withErrorHandling(async (_req: Request, ctx: Ctx) => {
  const { token } = await ctx.params;
  const advertiser = await findAdvertiserByToken(token);
  if (!advertiser) throw new ApiError(404, 'Submission link not found');
  return NextResponse.json({
    advertiserName: advertiser.name,
    publication: advertiser.publication,
  });
});

// ─── POST: create pending event ────────────────────────────────────────
export const POST = withErrorHandling(async (req: Request, ctx: Ctx) => {
  const { token } = await ctx.params;

  if (!recordHitAndCheck(token)) {
    throw new ApiError(
      429,
      'Too many submissions in a short window. Try again in a minute.'
    );
  }

  const advertiser = await findAdvertiserByToken(token);
  if (!advertiser) throw new ApiError(404, 'Submission link not found');

  const body = await req.json().catch(() => ({}));
  const parsed = submitEventSchema.parse(body);

  // Honeypot: silently succeed so bots don't learn they were caught.
  // No DB write happens.
  if (parsed.hp && parsed.hp.trim() !== '') {
    return NextResponse.json({ ok: true, queued: true });
  }

  const startDate = parseDateInput(parsed.startDate);
  if (!startDate) throw new ApiError(400, 'Event start date is required');
  const endDate = parseDateInput(parsed.endDate ?? null);

  if (endDate && new Date(endDate).getTime() < new Date(startDate).getTime()) {
    throw new ApiError(400, 'End date must be on or after the start date');
  }

  // Map advertiser publication to events.publication.
  // advertisers.publication is stored as 'realtyline'|'newsline'|'both'|null
  // but events.publication is 'austin'|'san_antonio'. Default to austin
  // since RealtyLine drives the bulk of the calendar; admin can re-assign
  // during review.
  const publication: 'austin' | 'san_antonio' =
    advertiser.publication === 'newsline' ? 'san_antonio' : 'austin';

  const event = await createSubmittedEvent({
    publication,
    title: parsed.title,
    description: parsed.description ?? null,
    location: parsed.location ?? null,
    startDate,
    endDate,
    website: parsed.website ? parsed.website : null,
    link: parsed.rsvpLink ? parsed.rsvpLink : null,
    imageUrl: parsed.imageUrl ? parsed.imageUrl : null,
    organizer: advertiser.name,
    advertiserId: advertiser.id,
  });

  // Fire-and-forget admin email notification. Failures swallowed so a
  // misconfigured email provider doesn't tank user submissions.
  notifyAdminsPendingEvent({
    eventId: event.id,
    title: event.title,
    organizer: advertiser.name,
    source: 'submission',
    startDate: event.startDate,
  }).catch((err) => {
    console.warn('[submit-event] notify failed:', err);
  });

  return NextResponse.json({ ok: true, eventId: event.id });
});
