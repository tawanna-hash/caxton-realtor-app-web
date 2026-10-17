// POST /api/portal/forgot { email }
//
// Partner password reset, step 1. Always answers { ok: true } so the form never
// reveals whether an email belongs to a partner. When it does, a single-use,
// 1-hour reset link is emailed from the partner's own publication domain.
// Throttled to 3 requests per partner per hour.

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { z } from 'zod';
import { getSql, ensureSchema } from '@/lib/db';
import { generateMagicLinkToken, hashMagicLinkToken } from '@/lib/portal';
import { EMAIL_SENDERS, getResendApiKeyForFrom } from '@/lib/email-sender';
import { senderAddressForPublication } from '@/lib/invoice-sender-routing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PORTAL_RESET_MARKER = 'portal-reset';
const RESET_TTL_MS = 60 * 60 * 1000;
const MAX_PER_HOUR = 3;
const APP_BASE_URL = process.env.APP_BASE_URL ?? 'https://realtynewsnow.app';

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(320) });

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  const generic = NextResponse.json({ ok: true });
  if (!parsed.success) return generic;
  const email = parsed.data.email;

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT id, name, publication, portal_email, billing_email, contact_email
        FROM advertisers
       WHERE lower(portal_email) = ${email}
       LIMIT 1
    `) as unknown as { id: number; name: string; publication: string | null }[];
    // Only the registered login email can reset; falls back to contact/billing
    // email for partners who have not set a login email yet.
    const row =
      rows[0] ??
      ((await sql`
        SELECT id, name, publication FROM advertisers
         WHERE portal_email IS NULL AND (lower(contact_email) = ${email} OR lower(billing_email) = ${email})
         ORDER BY id LIMIT 1
      `) as unknown as { id: number; name: string; publication: string | null }[])[0];
    if (!row) return generic;

    const recent = (await sql`
      SELECT COUNT(*)::int AS n FROM portal_magic_links
       WHERE advertiser_id = ${row.id} AND created_by = ${PORTAL_RESET_MARKER}
         AND created_at > NOW() - INTERVAL '1 hour'
    `) as unknown as { n: number }[];
    if ((recent[0]?.n ?? 0) >= MAX_PER_HOUR) return generic;

    const raw = generateMagicLinkToken();
    await sql`
      INSERT INTO portal_magic_links (advertiser_id, token_hash, purpose, link_expires_at, sent_to_email, created_by)
      VALUES (${row.id}, ${hashMagicLinkToken(raw)}, 'login', ${new Date(Date.now() + RESET_TTL_MS).toISOString()}, ${email}, ${PORTAL_RESET_MARKER})
    `;

    const sender = senderAddressForPublication(row.publication);
    const from = EMAIL_SENDERS[sender];
    const apiKey = getResendApiKeyForFrom(from);
    if (!apiKey) return generic;
    const url = `${APP_BASE_URL}/portal/reset?token=${encodeURIComponent(raw)}`;
    const brand = sender === 'tawanna@newslinesa.com' ? 'Newsline San Antonio' : 'RealtyLine';
    await new Resend(apiKey).emails.send({
      from,
      to: email,
      subject: `Reset your ${brand} portal password`,
      text: [
        `Hi ${row.name},`,
        '',
        `Use the link below to choose a new password for your ${brand} partner portal.`,
        'It is valid for 1 hour and can be used once.',
        '',
        url,
        '',
        "If you didn't ask for this, you can ignore this email; your password has not changed.",
      ].join('\n'),
      html: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#222">
        <h2 style="margin:0 0 12px;color:#301D5D">Reset your portal password</h2>
        <p style="font-size:15px;line-height:1.5">Hi ${esc(row.name)},</p>
        <p style="font-size:15px;line-height:1.5">Use the button below to choose a new password for your ${esc(brand)} partner portal. The link is valid for 1 hour and can be used once.</p>
        <p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#301D5D;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600">Choose a new password</a></p>
        <p style="font-size:12px;color:#888;word-break:break-all">${url}</p>
        <p style="font-size:12px;color:#888">If you didn't ask for this, you can ignore this email; your password has not changed.</p>
      </div>`,
    });
  } catch (err) {
    console.error('[portal/forgot]', err instanceof Error ? err.message : err);
  }
  return generic;
}
