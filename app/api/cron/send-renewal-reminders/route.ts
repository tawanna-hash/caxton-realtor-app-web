// app/api/cron/send-renewal-reminders/route.ts
//
// Daily cron that emails the admin (RENEWAL_ADMIN_EMAIL or EMAIL_FROM)
// a digest of agreements approaching expiration at 45 and 30 days out.
//
// Why an admin digest (not a direct advertiser email)?
//   Per product owner: renewals are admin-driven. The cron's job is to
//   surface which agreements are coming due so the admin can review and
//   manually click "Send renewal" on /admin/billing for each one.
//
// Window logic:
//   For each agreement with status in ('signed','active'), compute days
//   until exp_date (falling back to end_date). Include the row if the
//   day-count is exactly 45 or 30. Exact-match (not <= 45) prevents the
//   same agreement showing up in the digest 16 days in a row.
//
// Idempotency:
//   We append a 'renewal_reminder_notified' audit entry with the bucket
//   (45 or 30). If today's run already wrote that bucket for an agreement
//   we skip it — protects against double-fire if Vercel cron retries.
//
// Auth: CRON_SECRET bearer token OR x-vercel-cron header.

import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { appendAudit, type Agreement, type AgreementAuditEntry } from '@/lib/agreements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REMINDER_BUCKETS = [45, 30] as const;
type ReminderBucket = (typeof REMINDER_BUCKETS)[number];

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

type DigestRow = {
  agreement: Agreement;
  bucket: ReminderBucket;
  expDate: string | null;
};

function renderEmailHtml(rows: DigestRow[], siteUrl: string): string {
  const items = rows
    .map(({ agreement: ag, bucket, expDate }) => {
      const company = escapeHtml(ag.company_name ?? 'Unknown company');
      const rep = ag.rep_name ? escapeHtml(ag.rep_name) : null;
      const email = ag.advertiser_email ?? ag.billing_email ?? null;
      const adSize = ag.ad_size ? escapeHtml(ag.ad_size) : '—';
      const freq = ag.frequency ? escapeHtml(ag.frequency) : '—';
      const rate = formatCurrencyCents(ag.ad_rate_cents);
      const link = `${siteUrl}/admin/billing?agreement=${ag.id}`;
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
            <div style="color:${bucket === 30 ? '#b91c1c' : '#b45309'};font-weight:600;margin-top:2px">${bucket} days out</div>
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;vertical-align:top">
            <a href="${link}" style="display:inline-block;padding:8px 14px;background:#111827;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500">Open in admin</a>
          </td>
        </tr>`;
    })
    .join('');

  const total = rows.length;
  const at30 = rows.filter((r) => r.bucket === 30).length;
  const at45 = rows.filter((r) => r.bucket === 45).length;

  return `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:720px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
    <tr>
      <td style="padding:20px 24px;background:#111827;color:#fff">
        <div style="font-size:18px;font-weight:600">Renewal reminders</div>
        <div style="font-size:13px;color:#9ca3af;margin-top:4px">${total} agreement${total === 1 ? '' : 's'} coming due &middot; ${at30} at 30 days &middot; ${at45} at 45 days</div>
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
          <tbody>${items}</tbody>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 24px;background:#f9fafb;color:#6b7280;font-size:12px;text-align:center">
        Sent by /api/cron/send-renewal-reminders &middot; ${escapeHtml(siteUrl)}
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

  // Pull every signed/active agreement that has either exp_date or end_date.
  // Filtering in code (not SQL) because the bucket logic is exact-match and
  // small N — typically tens, not thousands of rows.
  const rows = (await sql`
    SELECT * FROM agreements
    WHERE status IN ('signed', 'active')
      AND (exp_date IS NOT NULL OR end_date IS NOT NULL)
  `) as unknown as Agreement[];

  const candidates: DigestRow[] = [];
  for (const ag of rows) {
    const expDate = ag.exp_date ?? ag.end_date;
    const days = getDaysUntil(expDate);
    if (days == null) continue;
    const bucket = REMINDER_BUCKETS.find((b) => b === days);
    if (!bucket) continue;
    candidates.push({ agreement: ag, bucket, expDate });
  }

  // Idempotency: drop rows where today's audit log already has a
  // renewal_reminder_notified entry for this bucket. Protects against
  // duplicate cron deliveries.
  const toNotify: DigestRow[] = [];
  for (const row of candidates) {
    const audit = (row.agreement.audit_log ?? []) as AgreementAuditEntry[];
    const alreadyNotified = audit.some(
      (e) =>
        e.event === 'renewal_reminder_notified' &&
        typeof e.timestamp === 'string' &&
        e.timestamp.slice(0, 10) === today &&
        typeof e.details === 'string' &&
        e.details.includes(`bucket:${row.bucket}`),
    );
    if (!alreadyNotified) toNotify.push(row);
  }

  if (toNotify.length === 0) {
    return NextResponse.json({
      ok: true,
      scanned: rows.length,
      matched: candidates.length,
      sent: 0,
      reason: 'no new reminders for today',
    });
  }

  const adminEmail =
    process.env.RENEWAL_ADMIN_EMAIL ??
    process.env.EMAIL_FROM_ADMIN ??
    'tawanna@myrealtyline.com';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtynewsnow.app';

  // Sort: 30-day bucket first (more urgent), then by expiration date.
  toNotify.sort((a, b) => {
    if (a.bucket !== b.bucket) return a.bucket - b.bucket;
    return (a.expDate ?? '').localeCompare(b.expDate ?? '');
  });

  const html = renderEmailHtml(toNotify, siteUrl);
  const subject = `${toNotify.length} renewal${toNotify.length === 1 ? '' : 's'} coming due — RealtyLine`;

  const emailResult = await sendEmail({ to: adminEmail, subject, html });

  if (!emailResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: 'email send failed',
        detail: emailResult.error,
        scanned: rows.length,
        matched: candidates.length,
      },
      { status: 502 },
    );
  }

  // Record per-agreement audit entries only after the email actually sent.
  // If the email fails we leave the audit log alone so tomorrow's run retries.
  for (const { agreement: ag, bucket } of toNotify) {
    try {
      const auditRows = (await sql`SELECT audit_log FROM agreements WHERE id = ${ag.id}`) as unknown as Array<{
        audit_log: AgreementAuditEntry[] | null;
      }>;
      const newLog = appendAudit(auditRows[0]?.audit_log, {
        event: 'renewal_reminder_notified',
        timestamp: new Date().toISOString(),
        details: `Admin digest sent — bucket:${bucket} days_until_exp:${bucket}`,
      });
      await sql`UPDATE agreements SET audit_log = ${JSON.stringify(newLog)}::jsonb WHERE id = ${ag.id}`;
    } catch (err) {
      // Audit write failure is non-fatal — the email already went out. Worst
      // case: we email again tomorrow, which is fine since both 45 and 30 are
      // single-day exact-match buckets that won't fire twice.
      console.error('[send-renewal-reminders] audit write failed for', ag.id, err);
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: rows.length,
    matched: candidates.length,
    sent: toNotify.length,
    bucketBreakdown: {
      at30: toNotify.filter((r) => r.bucket === 30).length,
      at45: toNotify.filter((r) => r.bucket === 45).length,
    },
  });
}
