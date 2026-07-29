// app/api/admin/marketing-campaigns/[id]/outreach/route.ts
//
// POST — create an outreach attempt under this campaign.
// Materializes recipient_ids on creation if status is 'scheduled' or 'sending'.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import {
  OUTREACH_CHANNEL_VALUES,
  OUTREACH_STATUS_VALUES,
  resolveAudience,
  type AudienceFilter,
} from '@/lib/marketing-campaigns';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteCtx = { params: Promise<{ id: string }> };

export const POST = withAdminTracking(async function POST(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const channel = typeof body.channel === 'string' && OUTREACH_CHANNEL_VALUES.has(body.channel as never)
    ? (body.channel as string) : 'email';
  const status = typeof body.status === 'string' && OUTREACH_STATUS_VALUES.has(body.status as never)
    ? (body.status as string) : 'draft';

  try {
    await ensureSchema();
    const sql = getSql();

    // Confirm parent campaign exists; pull its audience filter to materialize recipients
    // when caller is creating an already-scheduled/sending outreach.
    const campRows = (await sql`
      SELECT id, audience_filter FROM marketing_campaigns WHERE id = ${id}
    `) as unknown as { id: string; audience_filter: AudienceFilter }[];
    if (campRows.length === 0) {
      return NextResponse.json({ error: 'campaign not found' }, { status: 404 });
    }

    // Materialize recipients if going out the door now, unless caller provided explicit list.
    let recipientIds: number[] = Array.isArray(body.recipient_ids)
      ? (body.recipient_ids as unknown[]).filter((n): n is number => typeof n === 'number')
      : [];
    if (recipientIds.length === 0 && (status === 'scheduled' || status === 'sending' || status === 'sent')) {
      recipientIds = await resolveAudience(sql as never, campRows[0].audience_filter);
    }

    const sentAt = status === 'sent'
      ? (typeof body.sent_at === 'string' ? body.sent_at : new Date().toISOString())
      : (typeof body.sent_at === 'string' ? body.sent_at : null);

    const rows = await sql`
      INSERT INTO marketing_campaign_outreach (
        campaign_id, channel, subject, body, template_id, status,
        scheduled_for, sent_at, recipient_ids, recipient_count,
        stats, error_message, created_by
      ) VALUES (
        ${id},
        ${channel},
        ${(body.subject as string | undefined) ?? null},
        ${(body.body as string | undefined) ?? null},
        ${(body.template_id as string | undefined) ?? null},
        ${status},
        ${(body.scheduled_for as string | undefined) ?? null},
        ${sentAt},
        ${JSON.stringify(recipientIds)}::jsonb,
        ${recipientIds.length},
        ${JSON.stringify(body.stats ?? {})}::jsonb,
        ${(body.error_message as string | undefined) ?? null},
        ${admin.email ?? null}
      ) RETURNING *
    `;
    return NextResponse.json({ outreach: rows[0] }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'create failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
});
