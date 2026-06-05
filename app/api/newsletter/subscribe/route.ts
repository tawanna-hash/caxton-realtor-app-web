// POST /api/newsletter/subscribe
//
// Lightweight email-only newsletter signup. Backs the "Get All Our Content in
// One Weekly Email" form on the dashboard feed.
//
// Body: { email: string, publication?: 'realtyline' | 'newsline', source?: string }
//
// Behavior:
//   - Validates email
//   - Upserts into newsletter_subscribers (idempotent on (email, publication))
//   - If the row already exists with status='unsubscribed', reactivates it
//   - Returns { ok: true, already: boolean }

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getSql } from '@/lib/db';
import { withErrorHandling } from '@/lib/server/error';
import { getEmailProvider } from '@/lib/server/email';
import { renderNewsletterConfirmationEmail } from '@/lib/server/email/templates';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_PUBS = new Set(['realtyline', 'newsline']);

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = (await req.json().catch(() => null)) as
    | { email?: unknown; publication?: unknown; source?: unknown }
    | null;

  const rawEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!rawEmail || !EMAIL_RE.test(rawEmail) || rawEmail.length > 254) {
    return NextResponse.json(
      { ok: false, error: 'Please enter a valid email address.' },
      { status: 400 },
    );
  }

  const pubInput = typeof body?.publication === 'string' ? body.publication : 'realtyline';
  const publication = ALLOWED_PUBS.has(pubInput) ? pubInput : 'realtyline';

  const sourceInput = typeof body?.source === 'string' ? body.source : 'feed_inline';
  const source = sourceInput.slice(0, 64);

  const sourceIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    null;
  const userAgent = req.headers.get('user-agent')?.slice(0, 500) ?? null;

  const sql = getSql();

  const existing = (await sql`
    SELECT id, status FROM newsletter_subscribers
    WHERE email = ${rawEmail} AND publication = ${publication}
    LIMIT 1
  `) as Array<{ id: number; status: string }>;

  const wasAlready = existing.length > 0;
  const wasReactivated = wasAlready && existing[0]!.status !== 'active';

  if (wasAlready) {
    const row = existing[0]!;
    if (row.status !== 'active') {
      await sql`
        UPDATE newsletter_subscribers
        SET status = 'active', updated_at = NOW()
        WHERE id = ${row.id}
      `;
    }
  } else {
    await sql`
      INSERT INTO newsletter_subscribers
        (email, publication, source, status, source_ip, user_agent)
      VALUES
        (${rawEmail}, ${publication}, ${source}, 'active', ${sourceIp}, ${userAgent})
    `;
  }

  // Send the confirmation email for new subscribers and for reactivations.
  // Skip for already-active subscribers so we don't spam them on duplicate submits.
  if (!wasAlready || wasReactivated) {
    try {
      const h = await headers();
      const host = h.get('host') ?? 'realtynewsnow.app';
      const proto = h.get('x-forwarded-proto') ?? 'https';
      const base = process.env.NEXT_PUBLIC_SITE_URL || `${proto}://${host}`;
      const manageUrl = `${base}/newsletter`;

      const template = renderNewsletterConfirmationEmail({
        publication: publication as 'realtyline' | 'newsline',
        manageUrl,
      });

      const result = await getEmailProvider().send({
        to: { email: rawEmail },
        subject: template.subject,
        text: template.text,
        html: template.html,
        emailType: 'newsletter_confirmation',
        tags: ['newsletter_confirmation', publication],
      });

      if (!result.success) {
        logger.error(
          { email: rawEmail, publication, error: result.error },
          'Failed to send newsletter confirmation email',
        );
      }
    } catch (err) {
      // Never fail the signup because the welcome email failed.
      logger.error(
        { email: rawEmail, publication, err },
        'Newsletter confirmation email threw',
      );
    }
  }

  return NextResponse.json({ ok: true, already: wasAlready && !wasReactivated });
});
