/**
 * /api/market-interest  POST
 *
 * Public endpoint backing the "Notify me" form on Coming Soon market tiles
 * (RealtyLine Houston, RealtyLine Dallas/FTW). Persists the lead and emails the
 * admin so we can build a waitlist before a market launches.
 *
 * Body:
 *   { email, name?, market: 'realtyline-houston' | 'realtyline-dallas', website? }
 *
 * `website` is a honeypot field. Non-empty submissions are dropped silently
 * with a 200 so the bot believes it succeeded.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSql, ensureSchema } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { escapeHtml, wrapEmail, infoCard } from '@/lib/server/email/html';

export const runtime = 'nodejs';

const COMING_SOON_MARKETS = ['realtyline-houston', 'realtyline-dallas'] as const;

const MARKET_LABEL: Record<(typeof COMING_SOON_MARKETS)[number], string> = {
  'realtyline-houston': 'RealtyLine Houston',
  'realtyline-dallas': 'RealtyLine Dallas/FTW',
};

const schema = z.object({
  email: z.string().trim().email().max(320),
  name: z.string().trim().max(200).optional().default(''),
  market: z.enum(COMING_SOON_MARKETS),
  website: z.string().optional().default(''),
});

const ADMIN_EMAIL =
  process.env.MARKET_INTEREST_ADMIN_EMAIL ||
  process.env.RENEWAL_ADMIN_EMAIL ||
  'tawanna@myrealtyline.com';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', detail: parsed.error.message },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // Honeypot — silently succeed.
  if (data.website && data.website.trim() !== '') {
    return NextResponse.json({ ok: true });
  }

  await ensureSchema();
  const sql = getSql();

  // Idempotent table create. Kept narrow on purpose — we only need a tiny
  // waitlist surface; richer fields can be added when Phase 2 activates the
  // market.
  await sql`
    CREATE TABLE IF NOT EXISTS market_interest_leads (
      id           SERIAL PRIMARY KEY,
      market       TEXT NOT NULL,
      email        TEXT NOT NULL,
      name         TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ip           TEXT,
      user_agent   TEXT
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS market_interest_leads_market_email_uniq
      ON market_interest_leads (market, LOWER(email))
  `;

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    null;
  const ua = req.headers.get('user-agent') || null;

  // ON CONFLICT keeps the first signup but lets a repeat submit succeed
  // without surfacing duplicate-key errors to the user.
  await sql`
    INSERT INTO market_interest_leads (market, email, name, ip, user_agent)
    VALUES (${data.market}, ${data.email.toLowerCase()}, ${data.name || null}, ${ip}, ${ua})
    ON CONFLICT (market, LOWER(email)) DO NOTHING
  `;

  // Fire-and-log admin email. Failures here should not poison the user's
  // success path — they've already been saved to the DB.
  const marketLabel = MARKET_LABEL[data.market];
  const rowsHtml = `
    <p style="margin:0 0 6px 0;"><strong>Email:</strong> ${escapeHtml(data.email)}</p>
    <p style="margin:0 0 6px 0;"><strong>Name:</strong> ${escapeHtml(data.name || '—')}</p>
    <p style="margin:0;"><strong>Submitted:</strong> ${escapeHtml(new Date().toISOString())}</p>
  `;
  const html = wrapEmail({
    heading: 'New market interest signup',
    bodyHtml: `
      <p>A visitor signed up to be notified when <strong>${escapeHtml(marketLabel)}</strong> launches.</p>
      ${infoCard({ tier: 'Waitlist', title: marketLabel, bodyHtml: rowsHtml })}
    `,
  });
  try {
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `[Waitlist] ${marketLabel} - ${data.email}`,
      html,
      replyTo: data.email,
    });
  } catch (err) {
    console.warn('[market-interest] admin email failed:', err);
  }

  return NextResponse.json({ ok: true });
}
