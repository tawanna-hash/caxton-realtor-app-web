// app/api/admin/crm-email/sent/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const q = z.object({
  q: z.string().max(200).optional(),
  status: z.string().max(60).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  recurring: z.enum(['any', 'series', 'oneoff']).default('any'),
  group: z.enum(['flat', 'series']).default('flat'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  await ensureSchema();
  const sql = getSql();

  const url = new URL(req.url);
  const parsed = q.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_params', issues: parsed.error.issues }, { status: 400 });
  }
  const p = parsed.data;

  const qlike = p.q && p.q.trim().length > 0 ? `%${p.q.trim().toLowerCase()}%` : null;
  const status = p.status && p.status.length > 0 ? p.status : null;
  const from = p.from ?? null;
  const to = p.to ?? null;
  const recFilter = p.recurring;

  if (p.group === 'series') {
    const rows = (await sql`
      WITH roots AS (
        SELECT COALESCE(recurrence_parent_id, id) AS series_id
        FROM marketing_campaign_outreach
        WHERE (${qlike}::text IS NULL OR lower(COALESCE(subject, '')) LIKE ${qlike})
          AND (${status}::text IS NULL OR status = ${status})
          AND (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
          AND (${to}::timestamptz   IS NULL OR created_at <= ${to}::timestamptz)
          AND (
            ${recFilter} = 'any'
            OR (${recFilter} = 'series' AND (recurrence_interval_days IS NOT NULL OR recurrence_parent_id IS NOT NULL))
            OR (${recFilter} = 'oneoff' AND recurrence_interval_days IS NULL AND recurrence_parent_id IS NULL)
          )
        GROUP BY 1
      ),
      agg AS (
        SELECT
          COALESCE(o.recurrence_parent_id, o.id) AS series_id,
          COUNT(*) FILTER (WHERE o.status = 'sent') AS runs_sent,
          COUNT(*) AS runs_total,
          MAX(o.sent_at) AS last_sent_at,
          MIN(o.scheduled_for) FILTER (WHERE o.status = 'scheduled' AND o.scheduled_for > now()) AS next_scheduled_for
        FROM marketing_campaign_outreach o
        WHERE COALESCE(o.recurrence_parent_id, o.id) IN (SELECT series_id FROM roots)
        GROUP BY 1
      )
      SELECT
        o.id, o.subject, o.status, o.scheduled_for, o.sent_at, o.created_at,
        o.recurrence_interval_days, o.recurrence_until, o.recurrence_parent_id,
        o.from_name, o.reply_to, o.preview_text, o.recipient_count,
        (o.stats->>'sent')::int  AS sent_count,
        (o.stats->>'failed')::int AS failed_count,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'email', r.email,
            'first_name', r.first_name,
            'last_name', r.last_name,
            'company', r.company,
            'status', r.status,
            'error', r.error
          ) ORDER BY r.email)
          FROM marketing_campaign_outreach_recipients r
          JOIN marketing_campaign_outreach o2 ON o2.id = r.outreach_id
          WHERE COALESCE(o2.recurrence_parent_id, o2.id) = agg.series_id
            AND r.status IN ('failed', 'bounced')
        ), '[]'::jsonb) AS failed_recipients,
        agg.runs_sent, agg.runs_total, agg.last_sent_at, agg.next_scheduled_for,
        (SELECT COALESCE(SUM(r.open_count), 0) FROM marketing_campaign_outreach_recipients r JOIN marketing_campaign_outreach o2 ON o2.id = r.outreach_id WHERE COALESCE(o2.recurrence_parent_id, o2.id) = agg.series_id) AS open_count,
        (SELECT COALESCE(SUM(r.click_count), 0) FROM marketing_campaign_outreach_recipients r JOIN marketing_campaign_outreach o2 ON o2.id = r.outreach_id WHERE COALESCE(o2.recurrence_parent_id, o2.id) = agg.series_id) AS click_count,
        (SELECT MIN(r.opened_at) FROM marketing_campaign_outreach_recipients r JOIN marketing_campaign_outreach o2 ON o2.id = r.outreach_id WHERE COALESCE(o2.recurrence_parent_id, o2.id) = agg.series_id) AS first_opened_at,
        (SELECT MAX(r.opened_at) FROM marketing_campaign_outreach_recipients r JOIN marketing_campaign_outreach o2 ON o2.id = r.outreach_id WHERE COALESCE(o2.recurrence_parent_id, o2.id) = agg.series_id) AS last_opened_at
      FROM agg
      JOIN marketing_campaign_outreach o ON o.id = agg.series_id
      ORDER BY COALESCE(agg.last_sent_at, o.created_at) DESC
      LIMIT ${p.limit} OFFSET ${p.offset}
    `) as unknown as Array<Record<string, unknown>>;
    return NextResponse.json({ rows, group: 'series' });
  }

  const rows = (await sql`
    SELECT
      id, subject, status, scheduled_for, sent_at, created_at,
      recurrence_interval_days, recurrence_until, recurrence_parent_id,
      from_name, reply_to, preview_text, recipient_count,
      (stats->>'sent')::int AS sent_count,
      (stats->>'failed')::int AS failed_count,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'email', r.email,
          'first_name', r.first_name,
          'last_name', r.last_name,
          'company', r.company,
          'status', r.status,
          'error', r.error
        ) ORDER BY r.email)
        FROM marketing_campaign_outreach_recipients r
        WHERE r.outreach_id = marketing_campaign_outreach.id
          AND r.status IN ('failed', 'bounced')
      ), '[]'::jsonb) AS failed_recipients,
      (SELECT COALESCE(SUM(r.open_count), 0) FROM marketing_campaign_outreach_recipients r WHERE r.outreach_id = marketing_campaign_outreach.id) AS open_count,
      (SELECT COALESCE(SUM(r.click_count), 0) FROM marketing_campaign_outreach_recipients r WHERE r.outreach_id = marketing_campaign_outreach.id) AS click_count,
      (SELECT MIN(r.opened_at) FROM marketing_campaign_outreach_recipients r WHERE r.outreach_id = marketing_campaign_outreach.id) AS first_opened_at,
      (SELECT MAX(r.opened_at) FROM marketing_campaign_outreach_recipients r WHERE r.outreach_id = marketing_campaign_outreach.id) AS last_opened_at
    FROM marketing_campaign_outreach
    WHERE (${qlike}::text IS NULL OR lower(COALESCE(subject, '')) LIKE ${qlike})
      AND (${status}::text IS NULL OR status = ${status})
      AND (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
      AND (${to}::timestamptz   IS NULL OR created_at <= ${to}::timestamptz)
      AND (
        ${recFilter} = 'any'
        OR (${recFilter} = 'series' AND (recurrence_interval_days IS NOT NULL OR recurrence_parent_id IS NOT NULL))
        OR (${recFilter} = 'oneoff' AND recurrence_interval_days IS NULL AND recurrence_parent_id IS NULL)
      )
    ORDER BY COALESCE(sent_at, scheduled_for, created_at) DESC
    LIMIT ${p.limit} OFFSET ${p.offset}
  `) as unknown as Array<Record<string, unknown>>;
  return NextResponse.json({ rows, group: 'flat' });
}
