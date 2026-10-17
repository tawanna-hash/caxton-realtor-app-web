// POST /api/portal/login — password sign-in for partners who set a password.
// Creates a normal portal session (same as the emailed link) on success.

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getSql, ensureSchema } from '@/lib/db';
import {
  generateMagicLinkToken,
  hashMagicLinkToken,
  PORTAL_SESSION_COOKIE,
  PORTAL_SESSION_TTL_MS,
} from '@/lib/portal';
import { withErrorHandling } from '@/lib/server/error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(200),
});

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
// Constant-time-ish decoy so unknown emails cost the same as real ones.
let dummyHash: string | null = null;
async function getDummyHash(): Promise<string> {
  if (!dummyHash) dummyHash = await bcrypt.hash('portal-decoy-password', 12);
  return dummyHash;
}
const GENERIC = 'Incorrect email or password.';

export const POST = withErrorHandling(async (req: NextRequest) => {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: GENERIC }, { status: 401 });
  const { email, password } = parsed.data;

  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT id, portal_password_hash, portal_failed_logins, portal_locked_until
      FROM advertisers
     WHERE lower(portal_email) = ${email} AND portal_password_hash IS NOT NULL
     LIMIT 2
  `) as unknown as {
    id: number;
    portal_password_hash: string;
    portal_failed_logins: number;
    portal_locked_until: string | Date | null;
  }[];
  const row = rows.length === 1 ? rows[0] : null;

  if (row?.portal_locked_until && new Date(row.portal_locked_until).getTime() > Date.now()) {
    await bcrypt.compare(password, await getDummyHash());
    return NextResponse.json(
      { error: 'Too many attempts. Try again in 15 minutes or use the link from your email.' },
      { status: 429 },
    );
  }

  const ok = await bcrypt.compare(password, row?.portal_password_hash ?? (await getDummyHash()));
  if (!row || !ok) {
    if (row) {
      const failures = row.portal_failed_logins + 1;
      await sql`
        UPDATE advertisers
           SET portal_failed_logins = ${failures >= MAX_FAILURES ? 0 : failures},
               portal_locked_until = ${failures >= MAX_FAILURES ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null}
         WHERE id = ${row.id}
      `;
    }
    return NextResponse.json({ error: GENERIC }, { status: 401 });
  }

  const sessionExpires = new Date(Date.now() + PORTAL_SESSION_TTL_MS).toISOString();
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? null;
  const ua = req.headers.get('user-agent') ?? null;
  const link = (await sql`
    INSERT INTO portal_magic_links
      (advertiser_id, token_hash, purpose, link_expires_at, consumed_at, session_expires_at,
       ip_consumed, user_agent_consumed, sent_to_email, created_by)
    VALUES (${row.id}, ${hashMagicLinkToken(generateMagicLinkToken())}, 'login', NOW(), NOW(),
            ${sessionExpires}, ${ip}, ${ua}, ${email}, 'password-login')
    RETURNING id
  `) as unknown as { id: string }[];
  await sql`UPDATE advertisers SET portal_failed_logins = 0, portal_locked_until = NULL WHERE id = ${row.id}`;

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: PORTAL_SESSION_COOKIE,
    value: link[0].id,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
  return res;
});
