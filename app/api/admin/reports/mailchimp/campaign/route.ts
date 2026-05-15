// app/api/admin/reports/mailchimp/campaign/route.ts
// Per-campaign Mailchimp report with link-level click detail.
//
// Query params:
//   campaign_id (required) — alphanumeric Mailchimp campaign ID
//
// Auth: admin cookie (same pattern as /api/admin/reports/article).

import { NextRequest, NextResponse } from 'next/server';
import {
  isMailchimpConfigured,
  mailchimpFetch,
  type MailchimpCampaignReport,
  type MailchimpClickDetailsResponse,
} from '@/lib/mailchimp';
import type {
  MailchimpCampaignReportData,
  MailchimpClickedLink,
} from '@/app/admin/reports/_types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.myrealtyline.com';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function verifyAdmin(cookieHeader: string | null): Promise<boolean> {
  if (!cookieHeader) return false;
  try {
    const r = await fetch(`${API_URL}/admin/auth/me`, {
      method: 'GET',
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const isAdmin = await verifyAdmin(req.headers.get('cookie'));
  if (!isAdmin) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!isMailchimpConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'Mailchimp not configured. Set MAILCHIMP_API_KEY and MAILCHIMP_SERVER env vars in Vercel.' },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const campaignId = url.searchParams.get('campaign_id');
  if (!campaignId) {
    return NextResponse.json(
      { ok: false, error: 'campaign_id query parameter required' },
      { status: 400 },
    );
  }

  // Basic shape validation — Mailchimp campaign IDs are alphanumeric.
  if (!/^[a-zA-Z0-9]+$/.test(campaignId)) {
    return NextResponse.json(
      { ok: false, error: 'campaign_id must be alphanumeric' },
      { status: 400 },
    );
  }

  try {
    // Parallel fetch: campaign report + click details.
    const [report, clickDetails] = await Promise.all([
      mailchimpFetch<MailchimpCampaignReport>(`/reports/${campaignId}`),
      mailchimpFetch<MailchimpClickDetailsResponse>(
        `/reports/${campaignId}/click-details`,
        { searchParams: { count: '20' } },
      ),
    ]);

    // Sort top links by total clicks DESC, take top 10.
    const top_links: MailchimpClickedLink[] = (clickDetails.urls_clicked || [])
      .map((l) => ({
        url: l.url,
        total_clicks: l.total_clicks || 0,
        unique_clicks: l.unique_clicks || 0,
        click_percentage: l.click_percentage || 0,
      }))
      .sort((a, b) => b.total_clicks - a.total_clicks)
      .slice(0, 10);

    const bounces =
      (report.bounces?.hard_bounces || 0) +
      (report.bounces?.soft_bounces || 0) +
      (report.bounces?.syntax_errors || 0);

    const data: MailchimpCampaignReportData = {
      campaign: {
        campaign_id: report.id,
        subject_line: report.subject_line,
        title: report.campaign_title || report.subject_line,
        send_time: report.send_time,
        emails_sent: report.emails_sent || 0,
        list_name: report.list_name || '(unknown list)',
      },
      emails_sent: report.emails_sent || 0,
      opens_total: report.opens?.opens_total || 0,
      unique_opens: report.opens?.unique_opens || 0,
      open_rate: report.opens?.open_rate || 0,
      clicks_total: report.clicks?.clicks_total || 0,
      unique_clicks: report.clicks?.unique_clicks || 0,
      click_rate: report.clicks?.click_rate || 0,
      bounces,
      unsubscribes: report.unsubscribed || 0,
      top_links,
    };

    return NextResponse.json({ ok: true, report: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
