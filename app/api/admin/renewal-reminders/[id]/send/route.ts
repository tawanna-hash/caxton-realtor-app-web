// app/api/admin/renewal-reminders/[id]/send/route.ts
//
// POST — Send renewal email for a specific reminder.
// Auth: admin required.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { signToken } from '@/lib/sign-token';
import { sendEmail } from '@/lib/email';
import { renewalEmail } from '@/lib/email-templates';
import type { Agreement } from '@/lib/agreements';
import type { RenewalReminder } from '@/lib/types/renewal-reminder';
import { ApiError, withErrorHandling } from '@/lib/server/error';
import { idParamSchema } from '@/lib/server/schemas/_common';
import { renewalReminderSendBodySchema } from '@/lib/server/schemas/renewal-reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

function getDaysUntil(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const e = new Date(String(iso).slice(0, 10)); e.setHours(0, 0, 0, 0);
  return Math.round((e.getTime() - t.getTime()) / 86400000);
}

function humanDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch { return String(iso); }
}

export const POST = withErrorHandling(async (req: NextRequest, ctx: RouteCtx) => {
  const admin = await getCurrentAdmin();
  if (!admin) throw new ApiError(401, 'Unauthorized');

  const { id } = idParamSchema.parse(await ctx.params);

  // Body is optional — gracefully handle empty body.
  let rawBody: unknown = {};
  try { rawBody = await req.json(); } catch { /* optional */ }
  const body = renewalReminderSendBodySchema.parse(rawBody ?? {});
  const complete = body.complete !== false; // default true

  await ensureSchema();
  const sql = getSql();

  const reminderRows = await sql`SELECT * FROM renewal_reminders WHERE id = ${id}` as unknown as RenewalReminder[];
  if (reminderRows.length === 0) throw new ApiError(404, 'not found');
  const reminder = reminderRows[0];

  // Load the underlying agreement
  const agRows = await sql`SELECT * FROM agreements WHERE id = ${reminder.agreement_id}` as unknown as Agreement[];
  const ag = agRows[0] ?? null;

  const recipient = body.to || reminder.email || ag?.advertiser_email || ag?.billing_email;
  if (!recipient) {
    throw new ApiError(400, 'no email address on reminder or agreement');
  }

  const expDate = reminder.exp_date ?? ag?.exp_date ?? ag?.end_date;
  const daysRemaining = getDaysUntil(expDate);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtynewsnow.app';
  const token = signToken(reminder.agreement_id);
  const signingLink = `${siteUrl}/admin/billing/sign/${token}`;

  const html = renewalEmail({
    companyName: reminder.company_name ?? ag?.company_name ?? undefined,
    repName: reminder.rep_name ?? ag?.rep_name ?? undefined,
    expirationDate: humanDate(expDate),
    daysRemaining,
    adSize: reminder.ad_size ?? ag?.ad_size ?? undefined,
    frequency: reminder.frequency ?? ag?.frequency ?? undefined,
    adRate: reminder.ad_rate_cents != null ? reminder.ad_rate_cents / 100
          : ag?.ad_rate_cents != null ? ag.ad_rate_cents / 100 : 0,
    signingLink,
  });

  const result = await sendEmail({
    to: recipient,
    subject: `Renewal Reminder: Your RealtyLine Advertising Agreement — ${reminder.company_name ?? 'Agreement'}`,
    html,
  });

  if (!result.ok) {
    throw new ApiError(502, 'email send failed', result.error);
  }

  if (complete) {
    await sql`UPDATE renewal_reminders SET status = 'Completed' WHERE id = ${id}`;
  }

  return NextResponse.json({ ok: true, messageId: result.messageId, sentTo: recipient });
});
