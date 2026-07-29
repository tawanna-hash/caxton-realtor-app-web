// app/api/admin/portal-links/route.ts
//
// POST — staff creates a magic link for an advertiser. Emails it via Resend.
// GET  — list outstanding links (optionally filtered by advertiser_id).

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getSql, ensureSchema } from '@/lib/db';
import {
  generateMagicLinkToken,
  hashMagicLinkToken,
  PORTAL_LINK_TTL_MS,
  PORTAL_LINK_PURPOSE_VALUES,
  type PortalLinkPurpose,
} from '@/lib/portal';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PORTAL_FROM_EMAIL = process.env.PORTAL_FROM_EMAIL ?? 'no-reply@myrealtyline.com';
const APP_BASE_URL = process.env.APP_BASE_URL ?? 'https://app.myrealtyline.com';

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const advertiserId = req.nextUrl.searchParams.get('advertiser_id');
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = advertiserId
      ? await sql`
          SELECT id, advertiser_id, purpose, link_expires_at, consumed_at,
                 session_expires_at, sent_to_email, sent_at, created_by,
                 revoked_at, revoked_reason
          FROM portal_magic_links
          WHERE advertiser_id = ${Number(advertiserId)}
          ORDER BY sent_at DESC
          LIMIT 50
        `
      : await sql`
          SELECT id, advertiser_id, purpose, link_expires_at, consumed_at,
                 session_expires_at, sent_to_email, sent_at, created_by,
                 revoked_at, revoked_reason
          FROM portal_magic_links
          ORDER BY sent_at DESC
          LIMIT 50
        `;
    return NextResponse.json({ links: rows });
  } catch (err) {
    return NextResponse.json({ error: 'list failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}

export const POST = withAdminTracking(async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const advertiserId = typeof body.advertiser_id === 'number' ? body.advertiser_id : Number(body.advertiser_id);
  if (!advertiserId || Number.isNaN(advertiserId)) {
    return NextResponse.json({ error: 'advertiser_id required' }, { status: 400 });
  }
  const purpose: PortalLinkPurpose =
    typeof body.purpose === 'string' && PORTAL_LINK_PURPOSE_VALUES.has(body.purpose as PortalLinkPurpose)
      ? (body.purpose as PortalLinkPurpose)
      : 'login';
  const sendEmail = body.send_email !== false; // default true

  try {
    await ensureSchema();
    const sql = getSql();

    const adv = (await sql`
      SELECT id, name, portal_email, email FROM advertisers WHERE id = ${advertiserId}
    `) as unknown as { id: number; name: string; portal_email: string | null; email: string | null }[];
    if (adv.length === 0) {
      return NextResponse.json({ error: 'advertiser not found' }, { status: 404 });
    }
    const a = adv[0];
    const sendTo = (typeof body.email === 'string' && body.email) || a.portal_email || a.email;
    if (sendEmail && !sendTo) {
      return NextResponse.json({ error: 'no email on file' }, { status: 400 });
    }

    // Generate token + persist hashed
    const raw = generateMagicLinkToken();
    const tokenHash = hashMagicLinkToken(raw);
    const linkExpires = new Date(Date.now() + PORTAL_LINK_TTL_MS).toISOString();

    const inserted = (await sql`
      INSERT INTO portal_magic_links (
        advertiser_id, token_hash, purpose, link_expires_at,
        sent_to_email, created_by
      ) VALUES (
        ${advertiserId},
        ${tokenHash},
        ${purpose},
        ${linkExpires},
        ${sendTo},
        ${admin.email ?? null}
      )
      RETURNING id
    `) as unknown as { id: string }[];
    const linkId = inserted[0].id;
    const consumeUrl = `${APP_BASE_URL}/portal/consume?token=${encodeURIComponent(raw)}`;

    // Send via Resend (if enabled)
    let emailStatus: 'sent' | 'skipped' | 'failed' = 'skipped';
    if (sendEmail && sendTo && process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: PORTAL_FROM_EMAIL,
          to: sendTo,
          subject: 'Your secure link to the RealtyLine portal',
          html: portalEmailHtml({ name: a.name, consumeUrl, purpose }),
          text: portalEmailText({ name: a.name, consumeUrl, purpose }),
        });
        emailStatus = 'sent';
      } catch (err) {
        emailStatus = 'failed';
        // record but don't fail the request — staff can copy URL from response
        console.error('portal-link send failed', err);
      }
    }

    return NextResponse.json({
      ok: true,
      link_id: linkId,
      consume_url: consumeUrl,
      email_status: emailStatus,
      sent_to: sendTo,
    }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'create failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
});

// ── Email templates ─────────────────────────────────────────────────
function purposeBlurb(p: PortalLinkPurpose): string {
  switch (p) {
    case 'sign_agreement': return 'review and sign your advertising agreement';
    case 'pay_invoice':    return 'view and pay your invoice';
    case 'form':           return 'complete a short form for our records';
    default:               return 'access your account';
  }
}

function portalEmailText({ name, consumeUrl, purpose }: { name: string; consumeUrl: string; purpose: PortalLinkPurpose }): string {
  return [
    `Hi ${name},`,
    '',
    `Use the link below to ${purposeBlurb(purpose)} on the RealtyLine portal.`,
    'This link is valid for 24 hours and may only be used once.',
    '',
    consumeUrl,
    '',
    'If you didn\'t request this, please ignore this email.',
    '— RealtyLine',
  ].join('\n');
}

function portalEmailHtml({ name, consumeUrl, purpose }: { name: string; consumeUrl: string; purpose: PortalLinkPurpose }): string {
  return `
  <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:32px;color:#111">
    <h2 style="font-family:Georgia,serif;font-size:22px;margin:0 0 12px">RealtyLine portal access</h2>
    <p style="font-family:system-ui,sans-serif;color:#444;font-size:15px;line-height:1.5">Hi ${name},</p>
    <p style="font-family:system-ui,sans-serif;color:#444;font-size:15px;line-height:1.5">
      Use the secure link below to ${purposeBlurb(purpose)}. The link is valid for 24 hours and may only be used once.
    </p>
    <p style="margin:24px 0">
      <a href="${consumeUrl}" style="display:inline-block;background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-family:system-ui,sans-serif;font-weight:500">
        Open my portal
      </a>
    </p>
    <p style="font-family:system-ui,sans-serif;color:#999;font-size:12px;line-height:1.5">
      If the button doesn't work, copy this URL into your browser:<br>
      <span style="word-break:break-all">${consumeUrl}</span>
    </p>
    <p style="font-family:system-ui,sans-serif;color:#999;font-size:12px;margin-top:24px">
      If you didn't request this, please ignore this email.
    </p>
  </div>`;
}
