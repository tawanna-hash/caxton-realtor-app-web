// app/api/cron/renewal-rate-reminders/route.ts
//
// Hourly delivery of the one-time 24-hour renewal-rate reminder. A renewal
// becomes eligible 48 hours after its email starts a 72-hour offer window.
// Rows are claimed before sending so overlapping invocations cannot duplicate
// the message. A failed send releases the claim for the next hourly retry.

import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import {
  brandForPublication,
  renewalRateReminderEmail,
} from '@/lib/email-templates';
import { type Agreement, type AgreementAuditEntry } from '@/lib/agreements';
import { formatRenewalOfferDeadline } from '@/lib/renewal-offer';
import { signToken } from '@/lib/sign-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const auth = req.headers.get('authorization') ?? '';
  const secret = process.env.CRON_SECRET;
  if (secret && auth === `Bearer ${secret}`) return true;
  return req.headers.get('x-vercel-cron') === '1';
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sql = getSql();
  const eligible = await sql`
    SELECT *
    FROM agreements
    WHERE is_renewal = true
      AND status IN ('proposal_sent', 'sent')
      AND renewal_offer_expires_at IS NOT NULL
      AND renewal_offer_expires_at > NOW()
      AND renewal_offer_expires_at <= NOW() + INTERVAL '24 hours'
      AND renewal_offer_reminder_sent_at IS NULL
    ORDER BY renewal_offer_expires_at ASC
    LIMIT 100
  ` as unknown as Agreement[];

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtynewsnow.app';
  let sent = 0;
  let skipped = 0;
  const errors: Array<{ agreementId: string; error: string }> = [];

  for (const agreement of eligible) {
    const recipient =
      agreement.advertiser_email
      ?? agreement.billing_email
      ?? agreement.sent_to_email;
    if (!recipient || !agreement.renewal_offer_expires_at) {
      skipped += 1;
      continue;
    }

    // An exact timestamp acts as both the send marker and an ownership claim.
    // On failure, only this invocation's claim is released.
    const claimedAt = new Date().toISOString();
    const claimed = await sql`
      UPDATE agreements
      SET renewal_offer_reminder_sent_at = ${claimedAt}
      WHERE id = ${agreement.id}
        AND renewal_offer_reminder_sent_at IS NULL
        AND renewal_offer_expires_at > NOW()
        AND status IN ('proposal_sent', 'sent')
      RETURNING id
    ` as unknown as Array<{ id: string }>;
    if (claimed.length === 0) {
      skipped += 1;
      continue;
    }

    const brand = brandForPublication(agreement.publication);
    const signingLink = `${siteUrl}/admin/billing/sign/${signToken(agreement.id)}`;
    const deadline = formatRenewalOfferDeadline(agreement.renewal_offer_expires_at);
    const isReviewStage = agreement.status === 'proposal_sent';
    const subject = `24 Hours Left: Keep Your ${brand.brandName} Renewal Rate — ${agreement.company_name ?? 'Renewal Agreement'}`;
    const html = renewalRateReminderEmail({
      brand,
      companyName: agreement.company_name ?? undefined,
      repName: agreement.rep_name ?? undefined,
      adRateCents: agreement.ad_rate_cents,
      deadline,
      signingLink,
      isReviewStage,
    });

    const isNewslineSender =
      agreement.publication === 'san_antonio'
      || agreement.company_name?.trim().toLowerCase() === 'newsline san antonio';
    let result = await sendEmail({
      to: recipient,
      from: isNewslineSender ? 'Newsline San Antonio <hello@newslinesa.com>' : undefined,
      replyTo: isNewslineSender ? 'hello@newslinesa.com' : undefined,
      subject,
      html,
    });

    const newslineDomainUnverified =
      isNewslineSender
      && !result.ok
      && /newslinesa\.com domain is not verified/i.test(result.error ?? '');
    if (newslineDomainUnverified) {
      result = await sendEmail({
        to: recipient,
        replyTo: 'hello@newslinesa.com',
        subject,
        html,
      });
    }

    if (!result.ok) {
      await sql`
        UPDATE agreements
        SET renewal_offer_reminder_sent_at = NULL
        WHERE id = ${agreement.id}
          AND renewal_offer_reminder_sent_at = ${claimedAt}
      `;
      errors.push({
        agreementId: agreement.id,
        error: result.error ?? 'email send failed',
      });
      continue;
    }

    const auditEntry: AgreementAuditEntry = {
      event: 'renewal_rate_reminder_sent',
      timestamp: claimedAt,
      details: `24-hour renewal-rate reminder sent to ${recipient}. Deadline: ${deadline}. Resend messageId: ${result.messageId ?? 'n/a'}`,
    };
    await sql`
      UPDATE agreements
      SET audit_log = COALESCE(audit_log, '[]'::jsonb) || ${JSON.stringify(auditEntry)}::jsonb,
          updated_at = NOW()
      WHERE id = ${agreement.id}
        AND renewal_offer_reminder_sent_at = ${claimedAt}
    `;
    sent += 1;
  }

  return NextResponse.json({
    ok: errors.length === 0,
    eligible: eligible.length,
    sent,
    skipped,
    errors,
  });
}
