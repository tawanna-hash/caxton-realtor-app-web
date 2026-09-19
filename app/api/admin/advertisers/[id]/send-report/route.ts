// app/api/admin/advertisers/[id]/send-report/route.ts
//
// POST { from?, to?, message?, preview? }
//
// preview=true: returns { html, text, recipient } without sending.
// preview=false (default): sends the email via Resend to advertiser.contact_email,
//   returns { sent: true, recipient }.
//
// Admin-auth required. If RESEND_API_KEY isn't set, send falls back to
// logging the rendered HTML to Vercel logs (same pattern as magic-link route).

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { ensurePublicationColumn, getPublicationTheme } from '@/lib/publication-theme';
import {
  renderAdvertiserReportHtml,
  renderAdvertiserReportText,
} from '@/lib/advertiser-report';
import type { Advertiser } from '@/lib/advertisers';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { getEmailProvider } from '@/lib/server/email';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RESEND_KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;

async function isAdmin(): Promise<boolean> {
  try {
    const admin = await getCurrentAdmin();
    return admin !== null;
  } catch {
    return false;
  }
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

type RouteCtx = { params: Promise<{ id: string }> };

export const POST = withAdminTracking(async function POST(req: NextRequest, ctx: RouteCtx) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  let body: {
    from?: string;
    to?: string;
    message?: string;
    preview?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const preview = !!body.preview;
  const personalMessage = (body.message || '').toString().trim() || undefined;

  // Parse range (default last 30 days)
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

  try {
    await ensureSchema();
    await ensurePublicationColumn();
    const sql = getSql();

    const advRows = (await sql`
      SELECT * FROM advertisers WHERE id = ${idNum}
    `) as unknown as Advertiser[];
    if (advRows.length === 0) {
      return NextResponse.json({ error: 'partner not found' }, { status: 404 });
    }
    const advertiser = advRows[0];
    const theme = getPublicationTheme(advertiser.publication);

    // Recipient required for send (not for preview)
    const recipient = (advertiser.contact_email || '').trim();
    if (!preview && !recipient) {
      return NextResponse.json(
        { error: 'no contact email set for this partner' },
        { status: 400 },
      );
    }

    // Fetch analytics for the range — only published hotspots count, mirroring
    // what the advertiser sees on the public dashboard.
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

    const origin = getOrigin(req);
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
            : r.publication === 'san_antonio' ? 'Newsline San Antonio'
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

    if (preview) {
      return NextResponse.json({ html, text, recipient: recipient || null });
    }

    // Send via shared email provider (honors EMAIL_PROVIDER + EMAIL_FROM_*)
    const subject = `Your ${advertiser.name} performance report — ${theme.name}`;
    if (!RESEND_KEY && process.env.EMAIL_PROVIDER === 'resend') {
      console.warn('[partner-report] RESEND_API_KEY not configured');
      console.log('[partner-report] would have sent to:', recipient);
      console.log('[partner-report] subject:', subject);
      return NextResponse.json(
        { error: 'Resend not configured', detail: 'RESEND_API_KEY env var missing' },
        { status: 500 },
      );
    }

    // Per-publication branding: only the display NAME is overridden so the
    // advertiser sees the publication’s brand. The from-address always comes
    // from EMAIL_FROM_ADDRESS — single source of truth for the sender identity.
    const fromName = theme.fromEmailDisplayName;
    const result = await getEmailProvider().send({
      to: { email: recipient },
      subject,
      html,
      text,
      emailType: 'advertiser_report',
      from: { name: fromName },
    });
    if (!result.success) {
      console.error('[partner-report] send failed:', result.error);
      return NextResponse.json(
        { error: 'send failed', detail: result.error },
        { status: 502 },
      );
    }

    return NextResponse.json({ sent: true, recipient });
  } catch (err) {
    console.error('[admin/advertisers/:id/send-report]', errMessage(err));
    return NextResponse.json(
      { error: 'report failed', detail: errMessage(err) },
      { status: 500 },
    );
  }
});
