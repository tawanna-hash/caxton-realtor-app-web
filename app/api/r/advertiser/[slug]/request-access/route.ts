// app/api/r/advertiser/[slug]/request-access/route.ts
//
// POST { email } + ?t=<share_token>
// → If email matches advertiser.contact_email, creates a magic-link grant
//   and emails it (via Resend if RESEND_API_KEY set; else logs to Vercel logs).
// → Always returns { ok: true } regardless of email match,
//   so we don't reveal which emails are valid.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import {
  ensureGrantsSchema, generateGrantToken, MAGIC_LINK_EXPIRY_HOURS,
} from '@/lib/advertiser-grants';
import type { Advertiser } from '@/lib/advertisers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RESEND_KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
const FROM_EMAIL = process.env.MAGIC_LINK_FROM_EMAIL
  || process.env.RESEND_FROM_EMAIL
  || 'no-reply@app.myrealtyline.com';
const FROM_NAME = process.env.MAGIC_LINK_FROM_NAME || 'Realty News Now';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

function getOrigin(req: NextRequest): string {
  const envOrigin = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (envOrigin) return envOrigin.replace(/\/$/, '');
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('host') || 'app.myrealtyline.com';
  return `${proto}://${host}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderMagicLinkHtml(advertiserName: string, magicLink: string): string {
  const safeName = escapeHtml(advertiserName);
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#1f2937;">
  <h1 style="font-size:18px;font-weight:600;margin:0 0 16px;">Your ${safeName} performance report</h1>
  <p style="font-size:14px;line-height:1.6;margin:0 0 24px;color:#4b5563;">
    Click the button below to view your real-time performance report.
    The link is valid for 24 hours.
  </p>
  <p style="margin:0 0 24px;">
    <a href="${magicLink}" style="display:inline-block;background:#021D40;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;font-size:14px;">View report</a>
  </p>
  <p style="font-size:12px;color:#6b7280;margin:0 0 8px;">Or paste this URL into your browser:</p>
  <p style="font-size:12px;color:#6b7280;word-break:break-all;margin:0 0 24px;">${magicLink}</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 16px;">
  <p style="font-size:11px;color:#9ca3af;margin:0;">
    Sent by Realty News Now. If you didn&rsquo;t request this email, you can safely ignore it.
  </p>
</body></html>`;
}

type RouteCtx = { params: Promise<{ slug: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { slug } = await ctx.params;
  const url = new URL(req.url);
  const t = url.searchParams.get('t');

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const email = ((body && body.email) || '').trim().toLowerCase();
  if (!email || !/.+@.+\..+/.test(email)) {
    return NextResponse.json({ error: 'invalid email' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();

    const advRows = (await sql`
      SELECT id, name, slug, share_token, contact_email, requires_email_gate
      FROM advertisers WHERE slug = ${slug}
    `) as unknown as Advertiser[];
    if (advRows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    const advertiser = advRows[0];

    if (!t || t !== advertiser.share_token) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (!advertiser.requires_email_gate) {
      return NextResponse.json(
        { error: 'email gate disabled for this advertiser' },
        { status: 400 },
      );
    }

    const contactEmail = (advertiser.contact_email || '').trim().toLowerCase();
    const emailMatches = !!contactEmail && contactEmail === email;

    if (emailMatches) {
      await ensureGrantsSchema();
      const grantToken = generateGrantToken();
      const expiresAt = new Date(
        Date.now() + MAGIC_LINK_EXPIRY_HOURS * 60 * 60 * 1000,
      );
      const ip = req.headers.get('x-forwarded-for')
        || req.headers.get('x-real-ip')
        || null;

      await sql`
        INSERT INTO advertiser_email_grants (
          advertiser_id, grant_token, email, expires_at, ip_at_request
        ) VALUES (
          ${advertiser.id}, ${grantToken}, ${email},
          ${expiresAt.toISOString()}, ${ip}
        )
      `;

      const origin = getOrigin(req);
      const magicLink = `${origin}/api/r/advertiser/${slug}/verify?g=${encodeURIComponent(grantToken)}`;

      if (RESEND_KEY) {
        try {
          const resp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${RESEND_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: `${FROM_NAME} <${FROM_EMAIL}>`,
              to: [email],
              subject: `Your ${advertiser.name} performance report`,
              html: renderMagicLinkHtml(advertiser.name, magicLink),
            }),
          });
          if (!resp.ok) {
            const errText = await resp.text();
            console.error('[advertiser-grant] Resend failed:', resp.status, errText);
            console.log('[advertiser-grant] magic link (resend fallback):', magicLink);
          }
        } catch (err) {
          console.error('[advertiser-grant] Resend exception:', errMessage(err));
          console.log('[advertiser-grant] magic link (exception fallback):', magicLink);
        }
      } else {
        console.warn('[advertiser-grant] RESEND_API_KEY not configured');
        console.log('[advertiser-grant] magic link:', magicLink);
      }
    } else {
      console.log('[advertiser-grant] non-matching email attempt for', slug, ':', email);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[r/advertiser/:slug/request-access]', errMessage(err));
    return NextResponse.json(
      { error: 'request failed', detail: errMessage(err) },
      { status: 500 },
    );
  }
}
