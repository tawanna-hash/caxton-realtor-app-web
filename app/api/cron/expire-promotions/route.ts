// app/api/cron/expire-promotions/route.ts
//
// Hourly cron that auto-hides expired promotions from the public feed.
//
// Behavior:
//   1. Every hour: flip any kind='promotion' / status='active' row whose
//      expires_at has passed (in America/Chicago time) to status='expired'.
//      Public pages filter by status='active' (see lib/builder-inventory.ts
//      consumers in app/(public)/inventory|builders|communities|advertisers),
//      so flipping the status hides the row everywhere automatically.
//   2. Once per day at 13:00 UTC (8am Central), if any rows were flipped
//      in the last 24h, email a digest to tawanna@realtynewsnow.app.
//      Other hours just do the flip silently — no email noise.
//
// Grace period:
//   expires_at is a DATE (no time component). "End of the day" semantics
//   are achieved by comparing CURRENT_DATE in America/Chicago against
//   expires_at: a row with expires_at=2026-06-22 stays visible all day
//   on the 22nd in Central time and flips on the 23rd at midnight Central.
//
// Auth: CRON_SECRET bearer token OR x-vercel-cron header (same as
// /api/cron/agreement-lifecycle).
//
// Idempotency: the UPDATE only matches status='active' rows, so re-running
// is a no-op once a row is already 'expired'. The daily digest looks at
// rows where status='expired' AND updated_at >= now()-24h, so retries on
// the digest hour won't double-send a row that already flipped — but a
// retry within the same hour after a digest send WILL re-include rows
// flipped within the last 24h. Vercel cron only invokes once per slot, so
// this is fine in practice.

import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { ensureBuilderInventorySchema } from '@/lib/builder-inventory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

function authorized(req: Request): boolean {
  const auth = req.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  return req.headers.get('x-vercel-cron') === '1';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function humanDate(iso: string | null | undefined): string {
  if (!iso) return '\u2014';
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

// Current hour in America/Chicago (0..23). Used to decide whether to
// also send the daily digest on this run.
function chicagoHour(): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date());
  const h = parts.find((p) => p.type === 'hour')?.value ?? '0';
  // Intl can return "24" for midnight in some hour12=false configurations
  const n = Number(h);
  return n === 24 ? 0 : n;
}

// The hour we send the daily digest, in America/Chicago. 8 = 8am Central.
const DIGEST_HOUR_CHICAGO = 8;

interface FlippedRow {
  id: number;
  builder_name: string;
  title: string;
  city: string;
  state: string;
  publication: string;
  expires_at: string | null;
  updated_at: string;
}

function digestHtml(rows: FlippedRow[], siteUrl: string): string {
  const body = rows
    .map((r) => {
      const link = `${siteUrl}/admin/inventory/${r.id}`;
      const builder = escapeHtml(r.builder_name ?? 'Unknown');
      const title = escapeHtml(r.title ?? '');
      const where = escapeHtml(
        [r.city, r.state].filter(Boolean).join(', ') || '\u2014',
      );
      const pub = escapeHtml(r.publication ?? '\u2014');
      const exp = escapeHtml(humanDate(r.expires_at));
      return `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;vertical-align:top">
            <div style="font-weight:600;color:#111827;font-size:15px">${builder}</div>
            <div style="color:#4b5563;font-size:13px;margin-top:2px">${title}</div>
            <div style="color:#6b7280;font-size:12px;margin-top:2px">${where} &middot; ${pub}</div>
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;vertical-align:top;color:#374151;font-size:13px">
            <div>${exp}</div>
            <div style="color:#7f1d1d;font-weight:600;margin-top:2px">Expired</div>
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;vertical-align:top">
            <a href="${link}" style="display:inline-block;padding:8px 14px;background:#111827;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500">Open in admin</a>
          </td>
        </tr>`;
    })
    .join('');

  return `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:720px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
    <tr>
      <td style="padding:20px 24px;background:#111827;color:#fff">
        <div style="font-size:18px;font-weight:600">Promotions auto-expired</div>
        <div style="font-size:13px;color:#9ca3af;margin-top:4px">${rows.length} promotion${rows.length === 1 ? '' : 's'} hidden from public feed in the last 24 hours</div>
      </td>
    </tr>
    <tr>
      <td>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#f9fafb">
              <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e5e7eb">Promotion</th>
              <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e5e7eb">Expired</th>
              <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e5e7eb"></th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 24px;background:#f9fafb;color:#6b7280;font-size:12px;text-align:center">
        Sent by /api/cron/expire-promotions &middot; ${escapeHtml(siteUrl)}
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

  // Make sure the migration that added 'expired' to the CHECK constraint
  // has run — first deploy after this change will apply it here.
  await ensureBuilderInventorySchema();

  // ---- Step 1: flip expired active promotions -------------------------
  // CURRENT_DATE AT TIME ZONE 'America/Chicago' returns the calendar date
  // in Chicago. A row whose expires_at is strictly less than that date
  // has fully passed its "end of day Central" grace period.
  const flipped = (await sql`
    UPDATE builder_inventory
       SET status = 'expired',
           updated_at = NOW()
     WHERE kind = 'promotion'
       AND status = 'active'
       AND expires_at IS NOT NULL
       AND expires_at < (NOW() AT TIME ZONE 'America/Chicago')::date
    RETURNING id, builder_name, title, city, state, publication,
              expires_at::text AS expires_at, updated_at::text AS updated_at
  `) as unknown as FlippedRow[];

  // ---- Step 2: maybe send daily digest --------------------------------
  // Only send during the digest hour, and only if there are rows that
  // flipped within the last 24h (covers this run + any earlier runs
  // since yesterday's digest).
  const hour = chicagoHour();
  if (hour !== DIGEST_HOUR_CHICAGO) {
    return NextResponse.json({
      ok: true,
      flipped: flipped.length,
      digestSent: false,
      reason: `not digest hour (chicago hour ${hour})`,
    });
  }

  const recent = (await sql`
    SELECT id, builder_name, title, city, state, publication,
           expires_at::text AS expires_at, updated_at::text AS updated_at
      FROM builder_inventory
     WHERE kind = 'promotion'
       AND status = 'expired'
       AND updated_at >= NOW() - INTERVAL '24 hours'
     ORDER BY updated_at DESC
  `) as unknown as FlippedRow[];

  if (recent.length === 0) {
    return NextResponse.json({
      ok: true,
      flipped: flipped.length,
      digestSent: false,
      reason: 'no promotions expired in last 24h',
    });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtynewsnow.app';
  const html = digestHtml(recent, siteUrl);
  const subject = `${recent.length} promotion${recent.length === 1 ? '' : 's'} auto-expired \u2014 RealtyLine`;

  const emailResult = await sendEmail({
    to: 'tawanna@realtynewsnow.app',
    subject,
    html,
  });

  if (!emailResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: 'email send failed',
        detail: emailResult.error,
        flipped: flipped.length,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    flipped: flipped.length,
    digestSent: true,
    digestRows: recent.length,
  });
}
