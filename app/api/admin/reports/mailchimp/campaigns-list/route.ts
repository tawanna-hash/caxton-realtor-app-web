// app/api/admin/reports/mailchimp/campaigns-list/route.ts
// Dropdown helper: returns recent 'sent' campaigns from Mailchimp.
// Used to populate the campaign dropdown in the Mailchimp reports tab.
//
// Auth: admin cookie (same pattern as /api/admin/reports/article).

import { NextRequest, NextResponse } from 'next/server';
import {
  isMailchimpConfigured,
  mailchimpFetch,
  type MailchimpCampaignsListResponse,
} from '@/lib/mailchimp';
import type { MailchimpCampaignSummary } from '@/app/admin/reports/_types';

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

  try {
    // Pull last 50 sent campaigns, newest first.
    const data = await mailchimpFetch<MailchimpCampaignsListResponse>('/campaigns', {
      searchParams: {
        status: 'sent',
        sort_field: 'send_time',
        sort_dir: 'DESC',
        count: '50',
        fields: 'campaigns.id,campaigns.settings.subject_line,campaigns.settings.title,campaigns.send_time,campaigns.emails_sent,campaigns.recipients.list_name',
      },
    });

    const campaigns: MailchimpCampaignSummary[] = (data.campaigns || []).map((c) => ({
      campaign_id: c.id,
      subject_line: c.settings?.subject_line || '(no subject)',
      title: c.settings?.title || c.settings?.subject_line || '(untitled)',
      send_time: c.send_time,
      emails_sent: c.emails_sent || 0,
      list_name: c.recipients?.list_name || '(unknown list)',
    }));

    return NextResponse.json({ ok: true, campaigns });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
