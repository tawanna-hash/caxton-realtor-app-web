// app/api/cron/agreement-lifecycle/route.ts
//
// Daily cron at 13:00 UTC (8am Central) that:
//   1. Emails the admin a unified digest of agreements approaching or
//      reaching expiration — three buckets in one email:
//        a. 45-day heads-up   (exactly 45 days before exp_date)
//        b. 30-day countdown  (30..0 days before exp_date, daily)
//        c. Just expired      (exp_date passed; status flipped today)
//   2. Flips status to 'expired' for any signed/active agreement whose
//      exp_date is in the past. Writes an 'agreement_expired' audit entry
//      per row.
//
// One cron replaces the previous separate renewal-reminders cron, so the
// admin gets a single inbox-friendly digest with everything that needs
// attention. Status flips and the digest run in the same transaction
// logically — if status update succeeds but the email fails, the audit
// entry still records what happened.
//
// Idempotency:
//   - Status flip: only matches signed/active rows, so re-running is a
//     no-op once a row is already 'expired'.
//   - 45-day + 30..0 reminders: append a 'lifecycle_reminder_notified'
//     audit entry per agreement per send, tagged with today's date and
//     days-until-exp. Same-day cron retries skip rows already notified.
//
// Auth: CRON_SECRET bearer token OR x-vercel-cron header.

import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { appendAudit, type Agreement, type AgreementAuditEntry } from '@/lib/agreements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const auth = req.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  return req.headers.get('x-vercel-cron') === '1';
}

function getDaysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(iso.slice(0, 10));
  exp.setHours(0, 0, 0, 0);
  if (Number.isNaN(exp.getTime())) return null;
  return Math.round((exp.getTime() - today.getTime()) / 86_400_000);
}

function humanDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatCurrencyCents(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type Bucket = 'heads_up_45' | 'countdown_30' | 'just_expired';

interface DigestRow {
  agreement: Agreement;
  bucket: Bucket;
  daysUntil: number; // negative for already-expired
  expDate: string | null;
}

function rowHtml({ agreement: ag, bucket, daysUntil, expDate }: DigestRow, siteUrl: string): string {
  const company = escapeHtml(ag.company_name ?? 'Unknown company');
  const rep = ag.rep_name ? escapeHtml(ag.rep_name) : null;
  const email = ag.advertiser_email ?? ag.billing_email ?? null;
  const adSize = ag.ad_size ? escapeHtml(ag.ad_size) : '—';
  const freq = ag.frequency ? escapeHtml(ag.frequency) : '—';
  const rate = formatCurrencyCents(ag.ad_rate_cents);
  const link = `${siteUrl}/admin/billing?agreement=${ag.id}`;

  let badgeText: string;
  let badgeColor: string;
  if (bucket === 'just_expired') {
    badgeText = 'Expired';
    badgeColor = '#7f1d1d';
  } else if (bucket === 'heads_up_45') {
    badgeText = '45 days out';
    badgeColor = '#b45309';
  } else if (daysUntil === 0) {
    badgeText = 'Expires today';
    badgeColor = '#b91c1c';
  } else if (daysUntil <= 7) {
    badgeText = `${daysUntil} days left`;
    badgeColor = '#b91c1c';
  } else {
    badgeText = `${daysUntil} days left`;
    badgeColor = '#b45309';
  }

  return `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;vertical-align:top">
        <div style="font-weight:600;color:#111827;font-size:15px">${company}</div>
        ${rep ? `<div style="color:#4b5563;font-size:13px;margin-top:2px">${rep}${email ? ` &middot; ${escapeHtml(email)}` : ''}</div>` : email ? `<div style="color:#4b5563;font-size:13px;margin-top:2px">${escapeHtml(email)}</div>` : ''}
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;vertical-align:top;color:#374151;font-size:13px">
        <div>${adSize}</div>
        <div style="color:#6b7280;margin-top:2px">${freq} &middot; ${rate}</div>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;vertical-align:top;color:#374151;font-size:13px">
        <div>${escapeHtml(humanDate(expDate))}</div>
        <div style="color:${badgeColor};font-weight:600;margin-top:2px">${badgeText}</div>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;vertical-align:top">
        <a href="${link}" style="display:inline-block;padding:8px 14px;background:#111827;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500">Open in admin</a>
      </td>
    </tr>`;
}

function sectionHtml(title: string, subtitle: string, rows: DigestRow[], siteUrl: string): string {
  if (rows.length === 0) return '';
  const body = rows.map((r) => rowHtml(r, siteUrl)).join('');
  return `
    <tr>
      <td style="padding:20px 24px 8px 24px">
        <div style="font-size:14px;font-weight:600;color:#111827">${title}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px">${subtitle}</div>
      </td>
    </tr>
    <tr>
      <td>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#f9fafb">
              <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e5e7eb">Advertiser</th>
              <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e5e7eb">Ad</th>
              <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e5e7eb">Expires</th>
              <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e5e7eb"></th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </td>
    </tr>`;
}

function renderEmailHtml(
  expired: DigestRow[],
  countdown: DigestRow[],
  headsUp: DigestRow[],
  siteUrl: string,
): string {
  const total = expired.length + countdown.length + headsUp.length;
  const headerSub = [
    expired.length ? `${expired.length} just expired` : null,
    countdown.length ? `${countdown.length} in final 30 days` : null,
    headsUp.length ? `${headsUp.length} at 45-day mark` : null,
  ]
    .filter(Boolean)
    .join(' &middot; ');

  return `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:720px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
    <tr>
      <td style="padding:20px 24px;background:#111827;color:#fff">
        <div style="font-size:18px;font-weight:600">Agreement lifecycle digest</div>
        <div style="font-size:13px;color:#9ca3af;margin-top:4px">${total} agreement${total === 1 ? '' : 's'} need attention &middot; ${headerSub}</div>
      </td>
    </tr>
    ${sectionHtml('Just expired', 'Status flipped to expired this morning. Decide whether to renew or release the slot.', expired, siteUrl)}
    ${sectionHtml('Final 30 days', 'Daily countdown until expiration. Reach out now to lock in a renewal.', countdown, siteUrl)}
    ${sectionHtml('45-day heads-up', 'Renewal window opens here. First contact for renewal goes out around now.', headsUp, siteUrl)}
    <tr>
      <td style="padding:16px 24px;background:#f9fafb;color:#6b7280;font-size:12px;text-align:center">
        Sent by /api/cron/agreement-lifecycle &middot; ${escapeHtml(siteUrl)}
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  await ensureSchema();
  const sql = getSql();
  const today = new Date().toISOString().slice(0, 10);

  // ---- Step 1: flip expired statuses ----------------------------------
  // Any signed/active row whose exp_date (or end_date fallback) is in the
  // past becomes 'expired'. Returning the rows so we can include them in
  // the digest under "Just expired".
  const flipped = (await sql`
    UPDATE agreements
       SET status = 'expired',
           updated_at = NOW()
     WHERE status IN ('signed', 'active')
       AND COALESCE(exp_date, end_date) IS NOT NULL
       AND COALESCE(exp_date, end_date) < CURRENT_DATE
    RETURNING *
  `) as unknown as Agreement[];

  // Write audit entries for the flips. Best-effort: a failure here doesn't
  // unwind the status update, which is the more important state change.
  for (const ag of flipped) {
    try {
      const auditRows = (await sql`SELECT audit_log FROM agreements WHERE id = ${ag.id}`) as unknown as Array<{
        audit_log: AgreementAuditEntry[] | null;
      }>;
      const newLog = appendAudit(auditRows[0]?.audit_log, {
        event: 'agreement_expired',
        timestamp: new Date().toISOString(),
        details: `Auto-flipped to expired by lifecycle cron. exp_date=${ag.exp_date ?? ag.end_date ?? '—'}`,
      });
      await sql`UPDATE agreements SET audit_log = ${JSON.stringify(newLog)}::jsonb WHERE id = ${ag.id}`;
    } catch (err) {
      console.error('[agreement-lifecycle] audit write failed for', ag.id, err);
    }
  }

  // ---- Step 2: scan still-active rows for reminder buckets -------------
  const live = (await sql`
    SELECT * FROM agreements
    WHERE status IN ('signed', 'active')
      AND COALESCE(exp_date, end_date) IS NOT NULL
  `) as unknown as Agreement[];

  const headsUp: DigestRow[] = []; // exactly 45 days out
  const countdown: DigestRow[] = []; // 30..0 days out, daily
  const expired: DigestRow[] = flipped.map((ag) => {
    const expDate = ag.exp_date ?? ag.end_date;
    return {
      agreement: { ...ag, status: 'expired' },
      bucket: 'just_expired',
      daysUntil: getDaysUntil(expDate) ?? 0,
      expDate,
    };
  });

  for (const ag of live) {
    const expDate = ag.exp_date ?? ag.end_date;
    const days = getDaysUntil(expDate);
    if (days == null) continue;
    if (days === 45) {
      headsUp.push({ agreement: ag, bucket: 'heads_up_45', daysUntil: days, expDate });
    } else if (days >= 0 && days <= 30) {
      countdown.push({ agreement: ag, bucket: 'countdown_30', daysUntil: days, expDate });
    }
  }

  // ---- Step 3: idempotency for reminder buckets ------------------------
  // 'Just expired' fires only on the day status flips (already idempotent
  // via the WHERE clause above). The 45-day + countdown buckets need the
  // audit-log dedupe so same-day Vercel retries don't double-send.
  function alreadyNotified(ag: Agreement, days: number): boolean {
    const audit = (ag.audit_log ?? []) as AgreementAuditEntry[];
    return audit.some(
      (e) =>
        e.event === 'lifecycle_reminder_notified' &&
        typeof e.timestamp === 'string' &&
        e.timestamp.slice(0, 10) === today &&
        typeof e.details === 'string' &&
        e.details.includes(`days:${days}`),
    );
  }

  const headsUpToSend = headsUp.filter((r) => !alreadyNotified(r.agreement, r.daysUntil));
  const countdownToSend = countdown.filter((r) => !alreadyNotified(r.agreement, r.daysUntil));

  const allRows = [...expired, ...countdownToSend, ...headsUpToSend];
  if (allRows.length === 0) {
    return NextResponse.json({
      ok: true,
      flipped: flipped.length,
      scanned: live.length,
      sent: 0,
      reason: 'no new digest items for today',
    });
  }

  const adminEmail =
    process.env.RENEWAL_ADMIN_EMAIL ??
    process.env.EMAIL_FROM_ADMIN ??
    'tawanna@myrealtyline.com';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtynewsnow.app';

  // Sort within each section: expired first by how recently they expired,
  // countdown by fewest days remaining, heads-up by exp date.
  expired.sort((a, b) => (a.expDate ?? '').localeCompare(b.expDate ?? ''));
  countdownToSend.sort((a, b) => a.daysUntil - b.daysUntil);
  headsUpToSend.sort((a, b) => (a.expDate ?? '').localeCompare(b.expDate ?? ''));

  const html = renderEmailHtml(expired, countdownToSend, headsUpToSend, siteUrl);
  const headline =
    expired.length > 0
      ? `${expired.length} expired, ${countdownToSend.length + headsUpToSend.length} approaching`
      : `${countdownToSend.length + headsUpToSend.length} agreement${countdownToSend.length + headsUpToSend.length === 1 ? '' : 's'} coming due`;
  const subject = `${headline} — RealtyLine lifecycle digest`;

  const emailResult = await sendEmail({ to: adminEmail, subject, html });
  if (!emailResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: 'email send failed',
        detail: emailResult.error,
        flipped: flipped.length,
        scanned: live.length,
      },
      { status: 502 },
    );
  }

  // Record per-row reminder audit entries (only for the two reminder
  // buckets — expirations already wrote their own 'agreement_expired'
  // entry above).
  for (const row of [...countdownToSend, ...headsUpToSend]) {
    try {
      const auditRows = (await sql`SELECT audit_log FROM agreements WHERE id = ${row.agreement.id}`) as unknown as Array<{
        audit_log: AgreementAuditEntry[] | null;
      }>;
      const newLog = appendAudit(auditRows[0]?.audit_log, {
        event: 'lifecycle_reminder_notified',
        timestamp: new Date().toISOString(),
        details: `Lifecycle digest sent — bucket:${row.bucket} days:${row.daysUntil}`,
      });
      await sql`UPDATE agreements SET audit_log = ${JSON.stringify(newLog)}::jsonb WHERE id = ${row.agreement.id}`;
    } catch (err) {
      console.error('[agreement-lifecycle] reminder audit write failed for', row.agreement.id, err);
    }
  }

  return NextResponse.json({
    ok: true,
    flipped: flipped.length,
    scanned: live.length,
    sent: allRows.length,
    breakdown: {
      justExpired: expired.length,
      countdown30: countdownToSend.length,
      headsUp45: headsUpToSend.length,
    },
  });
}
