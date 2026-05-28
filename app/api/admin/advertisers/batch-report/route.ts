// app/api/admin/advertisers/batch-report/route.ts
//
// Phase 6e: batch advertiser performance reports.
// POST { advertiserIds: number[], from?, to?, message? }
//   -> sends a performance report email to each advertiser's contact_email,
//      reusing the same render + query logic as the per-advertiser sender.
//   -> returns { results: [{ id, name, sent, recipient?, error? }], sentCount, failCount }
//
// Advertisers without a contact_email are reported as failed with a clear
// reason (the UI also disables them, but we guard here too). Sends run
// sequentially to stay gentle on Resend rate limits for small batches.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { ensurePublicationColumn, getPublicationTheme } from '@/lib/publication-theme';
import {
  renderAdvertiserReportHtml,
  renderAdvertiserReportText,
} from '@/lib/advertiser-report';
import type { Advertiser } from '@/lib/advertisers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.myrealtyline.com';
const RESEND_KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
const FROM_EMAIL = process.env.MAGIC_LINK_FROM_EMAIL
  || process.env.RESEND_FROM_EMAIL
  || 'hello@myrealtyline.com';

async function isAdmin(cookieHeader: string | null): Promise<boolean> {
  if (!cookieHeader) return false;
  try {
    const r = await fetch(`${API_URL}/admin/auth/me`, {
      method: 'GET', headers: { cookie: cookieHeader }, cache: 'no-store',
    });
    return r.ok;
  } catch { return false; }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

function getOrigin(req: NextRequest): string {
  const envOrigin = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (envOrigin) return envOrigin.replace(/\/$/, '');
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('host') || 'app.myrealtyline.com';
  return `${proto}://${host}`;
}

interface BatchResult {
  id: number;
  name: string;
  sent: boolean;
  recipient?: string;
  error?: string;
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin(req.headers.get('cookie')))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    advertiserIds?: number[];
    from?: string;
    to?: string;
    message?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const ids = Array.isArray(body.advertiserIds)
    ? body.advertiserIds.filter((n) => Number.isInteger(n) && n > 0)
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'no advertiser ids provided' }, { status: 400 });
  }
  if (ids.length > 100) {
    return NextResponse.json({ error: 'too many advertisers in one batch (max 100)' }, { status: 400 });
  }

  const personalMessage = (body.message || '').toString().trim() || undefined;

  // Range (default last 30 days)
  const today = new Date();
  today.setUTCHours(23, 59, 59, 999);
  const defaultFrom = new Date(today);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);
  defaultFrom.setUTCHours(0, 0, 0, 0);

  let from: Date;
  let to: Date;
  try {
    from = body.from ? new Date(body.from) : defaultFrom;
    to = body.to ? new Date(body.to) : today;
    if (isNaN(from.getTime()) || isNaN(to.getTime())) throw new Error('invalid date');
    if (from > to) throw new Error('from > to');
  } catch (err) {
    return NextResponse.json({ error: 'invalid date range', detail: errMessage(err) }, { status: 400 });
  }
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  if (!RESEND_KEY) {
    return NextResponse.json(
      { error: 'Resend not configured', detail: 'RESEND_API_KEY env var missing' },
      { status: 500 },
    );
  }

  try {
    await ensureSchema();
    await ensurePublicationColumn();
    const sql = getSql();
    const origin = getOrigin(req);
    const results: BatchResult[] = [];

    for (const idNum of ids) {
      try {
        const advRows = (await sql`
          SELECT * FROM advertisers WHERE id = ${idNum}
        `) as unknown as Advertiser[];
        if (advRows.length === 0) {
          results.push({ id: idNum, name: `#${idNum}`, sent: false, error: 'advertiser not found' });
          continue;
        }
        const advertiser = advRows[0];
        const recipient = (advertiser.contact_email || '').trim();
        if (!recipient) {
          results.push({ id: idNum, name: advertiser.name, sent: false, error: 'no contact email' });
          continue;
        }
        const theme = getPublicationTheme(advertiser.publication);

        const summaryRows = (await sql`
          SELECT
            COUNT(c.id)::int AS total_clicks,
            COUNT(DISTINCT c.session_id)::int AS unique_sessions
          FROM magazine_hotspot_clicks c
          JOIN magazine_hotspots h ON c.hotspot_id = h.id
          WHERE h.advertiser_id = ${idNum}
            AND h.is_published = true
            AND c.occurred_at >= ${fromIso}
            AND c.occurred_at <= ${toIso}
        `) as unknown as Array<{ total_clicks: number; unique_sessions: number }>;

        const hotspotCountRows = (await sql`
          SELECT COUNT(*)::int AS count
          FROM magazine_hotspots
          WHERE advertiser_id = ${idNum} AND is_published = true
        `) as unknown as Array<{ count: number }>;

        const topDayRows = (await sql`
          SELECT DATE(c.occurred_at)::text AS date, COUNT(*)::int AS clicks
          FROM magazine_hotspot_clicks c
          JOIN magazine_hotspots h ON c.hotspot_id = h.id
          WHERE h.advertiser_id = ${idNum}
            AND h.is_published = true
            AND c.occurred_at >= ${fromIso}
            AND c.occurred_at <= ${toIso}
          GROUP BY DATE(c.occurred_at)
          ORDER BY clicks DESC, date DESC
          LIMIT 1
        `) as unknown as Array<{ date: string; clicks: number }>;

        const hotspotRows = (await sql`
          SELECT
            h.page_idx,
            h.label,
            h.magazine_id,
            m.publication,
            m.issue_label,
            COUNT(c.id)::int AS clicks,
            COUNT(DISTINCT c.session_id)::int AS unique_sessions
          FROM magazine_hotspots h
          LEFT JOIN magazines m ON h.magazine_id = m.id
          LEFT JOIN magazine_hotspot_clicks c ON c.hotspot_id = h.id
            AND c.occurred_at >= ${fromIso}
            AND c.occurred_at <= ${toIso}
          WHERE h.advertiser_id = ${idNum}
            AND h.is_published = true
          GROUP BY h.id, m.publication, m.issue_label
          ORDER BY clicks DESC, h.id
          LIMIT 25
        `) as unknown as Array<{
          page_idx: number;
          label: string | null;
          magazine_id: number;
          publication: string | null;
          issue_label: string | null;
          clicks: number;
          unique_sessions: number;
        }>;

        const shareUrl = `${origin}/r/advertiser/${advertiser.slug}?t=${advertiser.share_token}`;
        const reportInput = {
          advertiserName: advertiser.name,
          shareUrl,
          theme,
          range: { from: fromIso, to: toIso },
          totalClicks: summaryRows[0]?.total_clicks ?? 0,
          uniqueSessions: summaryRows[0]?.unique_sessions ?? 0,
          hotspotCount: hotspotCountRows[0]?.count ?? 0,
          topDay: topDayRows[0] || null,
          hotspots: hotspotRows.map((r) => ({
            magazineLabel: [
              r.publication === 'austin' ? 'RealtyLine'
                : r.publication === 'san_antonio' ? 'Newsline SA'
                : 'Magazine',
              r.issue_label || `#${r.magazine_id}`,
            ].join(' · '),
            pageNumber: r.page_idx + 1,
            label: r.label,
            clicks: r.clicks,
            uniqueSessions: r.unique_sessions,
          })),
          personalMessage,
        };

        const html = renderAdvertiserReportHtml(reportInput);
        const text = renderAdvertiserReportText(reportInput);
        const subject = `Your ${advertiser.name} performance report — ${theme.name}`;
        const fromName = process.env.MAGIC_LINK_FROM_NAME || theme.fromEmailDisplayName;

        const resp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `${fromName} <${FROM_EMAIL}>`,
            to: [recipient],
            subject,
            html,
            text,
          }),
        });
        if (!resp.ok) {
          const errText = await resp.text();
          results.push({ id: idNum, name: advertiser.name, sent: false, recipient, error: `Resend ${resp.status}: ${errText.slice(0, 120)}` });
          continue;
        }
        results.push({ id: idNum, name: advertiser.name, sent: true, recipient });
      } catch (err) {
        results.push({ id: idNum, name: `#${idNum}`, sent: false, error: errMessage(err) });
      }
    }

    const sentCount = results.filter((r) => r.sent).length;
    const failCount = results.length - sentCount;
    return NextResponse.json({ results, sentCount, failCount });
  } catch (err) {
    console.error('[admin/advertisers/batch-report]', errMessage(err));
    return NextResponse.json(
      { error: 'batch report failed', detail: errMessage(err) },
      { status: 500 },
    );
  }
}
