// app/api/admin/tearsheets/[id]/send/route.ts
//
// POST — Send this tearsheet to the advertiser (or a supplied `to`
// address). Uses Resend if configured; otherwise falls back to just
// stamping status=sent so the record reflects manual delivery.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { ensureSchema, getSql } from '@/lib/db';
import { getTearsheet, markTearsheetSent } from '@/lib/server/tearsheets-store';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withAdminTracking(async function POST(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  await ensureSchema();
  const { id } = await ctx.params;

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // empty body is fine — we'll look up advertiser email
  }

  const ts = await getTearsheet(id);
  if (!ts) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Resolve destination email.
  let to = typeof body.to === 'string' ? body.to.trim() : '';
  if (!to && ts.advertiser_id) {
    const sql = getSql();
    const rows = (await sql`
      SELECT email FROM advertisers WHERE id = ${ts.advertiser_id} LIMIT 1
    `) as unknown as Array<{ email: string | null }>;
    to = rows[0]?.email ?? '';
  }
  if (!to) {
    return NextResponse.json({ error: 'no recipient email' }, { status: 400 });
  }

  // Try Resend, but always stamp status=sent so the UI reflects it.
  let emailed = false;
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey && ts.file_url) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${resendKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Realty News Now <ads@realtynewsnow.app>',
          to,
          subject: `Your ad tearsheet${ts.issue_label ? ' — ' + ts.issue_label : ''}`,
          html: `<p>Attached is the tearsheet for your recent ad placement.</p>
                 <p><a href="${ts.file_url}">View tearsheet</a></p>
                 <p style="color:#666;font-size:12px;">Realty News Now · realtynewsnow.app</p>`,
        }),
      });
      emailed = resp.ok;
    } catch {
      emailed = false;
    }
  }

  const updated = await markTearsheetSent(id, to);
  return NextResponse.json({ tearsheet: updated, emailed, to });
});
