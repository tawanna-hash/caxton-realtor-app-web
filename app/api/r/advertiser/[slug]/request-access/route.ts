// app/api/r/advertiser/[slug]/request-access/route.ts
//
// POST { email } + ?t=<share_token>
// → If email matches advertiser.contact_email, creates a magic-link grant
//   and emails it (via Resend if RESEND_API_KEY set; else logs to Vercel logs).
// → Email subject + from-display + button color all theme per advertiser's
//   publication (RealtyLine Austin navy, Newsline San Antonio purple, etc).

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import {
  ensureGrantsSchema, generateGrantToken, MAGIC_LINK_EXPIRY_HOURS,
} from '@/lib/advertiser-grants';
import {
  ensurePublicationColumn, getPublicationTheme,
} from '@/lib/publication-theme';
import type { Advertiser } from '@/lib/advertisers';
import { getEmailProvider } from '@/lib/server/email';
import { escapeHtml } from '@/lib/server/email/html';
import { rateLimit } from '@/lib/server/rate-limit';
import { ApiError } from '@/lib/server/error';

// F-11: mask the local-part of an email before logging so PII doesn't land
// in Vercel Logs. Keeps enough signal to debug (first char + domain).
function maskEmail(email: string): string {
  return email.replace(/^(.).+(@.+)$/, '$1***$2');
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RESEND_KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY;

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



function renderMagicLinkHtml(
  publicationName: string,
  advertiserName: string,
  magicLink: string,
  primaryColor: string,
): string {
  const safeAdv = escapeHtml(advertiserName);
  const safePub = escapeHtml(publicationName);
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#301D5D;">
  <h1 style="font-size:18px;font-weight:600;margin:0 0 16px;">Your ${safeAdv} performance report</h1>
  <p style="font-size:14px;line-height:1.6;margin:0 0 24px;color:#4b5563;">
    Click the button below to view your real-time performance report in ${safePub}.
    The link is valid for 24 hours.
  </p>
  <p style="margin:0 0 24px;">
    <a href="${magicLink}" style="display:inline-block;background:${primaryColor};color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;font-size:14px;">View report</a>
  </p>
  <p style="font-size:12px;color:#6b7280;margin:0 0 8px;">Or paste this URL into your browser:</p>
  <p style="font-size:12px;color:#6b7280;word-break:break-all;margin:0 0 24px;">${magicLink}</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 16px;">
  <p style="font-size:11px;color:#9ca3af;margin:0;">
    Sent by ${safePub}. If you didn&rsquo;t request this email, you can safely ignore it.
  </p>
</body></html>`;
}

type RouteCtx = { params: Promise<{ slug: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { slug } = await ctx.params;
  const url = new URL(req.url);
  const t = url.searchParams.get('t');

  // F-05: cap magic-link requests per IP so this endpoint can't be used to
  // flood an advertiser's contact_email inbox.
  try {
    await rateLimit('magicLinkRequest', slug);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 429) {
      return NextResponse.json({ error: 'too many requests' }, { status: 429 });
    }
    throw err;
  }

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
    await ensurePublicationColumn();
    const sql = getSql();

    const advRows = (await sql`
      SELECT * FROM advertisers WHERE slug = ${slug}
    `) as unknown as Advertiser[];
    if (advRows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    const advertiser = advRows[0];
    const theme = getPublicationTheme(advertiser.publication);

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
      const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_HOURS * 60 * 60 * 1000);
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

      const providerMode = (process.env.EMAIL_PROVIDER ?? 'console').toLowerCase();
      if (providerMode !== 'resend' || RESEND_KEY) {
        // Per-publication display name only; address always comes from
        // EMAIL_FROM_ADDRESS inside the provider.
        const fromName = theme.fromEmailDisplayName;
        try {
          const result = await getEmailProvider().send({
            to: { email },
            subject: `Your ${advertiser.name} performance report — ${theme.name}`,
            html: renderMagicLinkHtml(theme.name, advertiser.name, magicLink, theme.primaryColor),
            text: `Open your ${advertiser.name} performance report: ${magicLink}`,
            emailType: 'advertiser_grant_magic_link',
            from: { name: fromName },
          });
          if (!result.success) {
            console.error('[advertiser-grant] send failed:', result.error);
            console.log('[advertiser-grant] magic link (send fallback):', magicLink);
          }
        } catch (err) {
          console.error('[advertiser-grant] send exception:', errMessage(err));
          console.log('[advertiser-grant] magic link (exception fallback):', magicLink);
        }
      } else {
        console.warn('[advertiser-grant] RESEND_API_KEY not configured');
        console.log('[advertiser-grant] magic link:', magicLink);
      }
    } else {
      // F-11: log masked email so PII doesn't end up in Vercel Logs.
      console.log('[advertiser-grant] non-matching email attempt for', slug, ':', maskEmail(email));
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
