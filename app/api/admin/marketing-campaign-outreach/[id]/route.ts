// app/api/admin/marketing-campaign-outreach/[id]/route.ts
//
// PATCH  — update outreach. Auto-stamps sent_at on status='sent';
//          materializes recipient_ids via resolveAudience() when
//          status transitions to 'sending' or 'sent' and no recipients exist.
// DELETE — remove outreach record.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import {
  OUTREACH_PATCHABLE_FIELDS,
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

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();

    // Load current row + parent campaign filter (need both for lifecycle logic).
    const current = (await sql`
      SELECT o.id, o.campaign_id, o.status, o.sent_at, o.recipient_ids
      FROM marketing_campaign_outreach o
      WHERE o.id = ${id}
    `) as unknown as {
      id: string;
      campaign_id: string;
      status: string;
      sent_at: string | null;
      recipient_ids: number[] | null;
    }[];
    if (current.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    const row = current[0];

    // Auto-stamp sent_at when transitioning to 'sent'
    if (typeof body.status === 'string' && body.status === 'sent' && !('sent_at' in body) && !row.sent_at) {
      body.sent_at = new Date().toISOString();
    }

    // Materialize recipient_ids when transitioning into sending/sent/scheduled
    // and the row doesn't already have a recipient list.
    const goingOut = typeof body.status === 'string'
      && (body.status === 'sending' || body.status === 'sent' || body.status === 'scheduled');
    const currentRecipients = row.recipient_ids ?? [];
    if (goingOut && currentRecipients.length === 0 && !('recipient_ids' in body)) {
      const camp = (await sql`
        SELECT audience_filter FROM marketing_campaigns WHERE id = ${row.campaign_id}
      `) as unknown as { audience_filter: AudienceFilter }[];
      if (camp.length > 0) {
        const ids = await resolveAudience(sql as never, camp[0].audience_filter);
        body.recipient_ids = ids;
        body.recipient_count = ids.length;
      }
    }

    const updated: string[] = [];
    for (const field of OUTREACH_PATCHABLE_FIELDS) {
      if (!(field in body)) continue;
      const raw = body[field as keyof typeof body];
      if (field === 'channel' && typeof raw === 'string' && !OUTREACH_CHANNEL_VALUES.has(raw as never)) continue;
      if (field === 'status'  && typeof raw === 'string' && !OUTREACH_STATUS_VALUES.has(raw as never))  continue;

      switch (field) {
        case 'channel':         await sql`UPDATE marketing_campaign_outreach SET channel = ${raw} WHERE id = ${id}`; break;
        case 'subject':         await sql`UPDATE marketing_campaign_outreach SET subject = ${raw} WHERE id = ${id}`; break;
        case 'body':            await sql`UPDATE marketing_campaign_outreach SET body = ${raw} WHERE id = ${id}`; break;
        case 'template_id':     await sql`UPDATE marketing_campaign_outreach SET template_id = ${raw} WHERE id = ${id}`; break;
        case 'status':          await sql`UPDATE marketing_campaign_outreach SET status = ${raw} WHERE id = ${id}`; break;
        case 'scheduled_for':   await sql`UPDATE marketing_campaign_outreach SET scheduled_for = ${raw} WHERE id = ${id}`; break;
        case 'sent_at':         await sql`UPDATE marketing_campaign_outreach SET sent_at = ${raw} WHERE id = ${id}`; break;
        case 'recipient_ids':   await sql`UPDATE marketing_campaign_outreach SET recipient_ids = ${JSON.stringify(raw ?? [])}::jsonb WHERE id = ${id}`; break;
        case 'recipient_count': await sql`UPDATE marketing_campaign_outreach SET recipient_count = ${raw} WHERE id = ${id}`; break;
        case 'stats':           await sql`UPDATE marketing_campaign_outreach SET stats = ${JSON.stringify(raw ?? {})}::jsonb WHERE id = ${id}`; break;
        case 'error_message':   await sql`UPDATE marketing_campaign_outreach SET error_message = ${raw} WHERE id = ${id}`; break;
      }
      updated.push(field);
    }

    if (updated.length === 0) {
      return NextResponse.json({ error: 'no patchable fields' }, { status: 400 });
    }
    const out = await sql`SELECT * FROM marketing_campaign_outreach WHERE id = ${id}`;
    return NextResponse.json({ outreach: out[0], updated_fields: updated });
  } catch (err) {
    return NextResponse.json({ error: 'patch failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}

export const DELETE = withAdminTracking(async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  try {
    await ensureSchema();
    const sql = getSql();
    await sql`DELETE FROM marketing_campaign_outreach WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: 'delete failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
});
