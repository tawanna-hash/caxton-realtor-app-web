// POST /api/admin/portal-preview — admin-only. Starts a read-only, 1-hour
// preview session of a partner's portal in the admin's own browser. No email
// is sent and the partner is not notified. Mutating /api/portal/* calls are
// blocked in proxy.ts while the preview cookie is present.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSql, ensureSchema } from '@/lib/db';
import {
  generateMagicLinkToken,
  hashMagicLinkToken,
  PORTAL_PREVIEW_COOKIE,
  PORTAL_PREVIEW_CREATED_BY,
  PORTAL_PREVIEW_TTL_MS,
  PORTAL_SESSION_COOKIE,
} from '@/lib/portal';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ advertiser_id: z.number().int().positive(), invoice_id: z.string().uuid().optional() });

export const POST = withAdminTracking(async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'advertiser_id required' }, { status: 400 });

  await ensureSchema();
  const sql = getSql();
  const exists = (await sql`SELECT id FROM advertisers WHERE id = ${parsed.data.advertiser_id}`) as unknown as unknown[];
  if (exists.length === 0) return NextResponse.json({ error: 'Partner not found' }, { status: 404 });

  const expires = new Date(Date.now() + PORTAL_PREVIEW_TTL_MS).toISOString();
  const rows = (await sql`
    INSERT INTO portal_magic_links
      (advertiser_id, token_hash, purpose, link_expires_at, consumed_at, session_expires_at,
       sent_to_email, created_by)
    VALUES (${parsed.data.advertiser_id}, ${hashMagicLinkToken(generateMagicLinkToken())}, 'login', NOW(), NOW(),
            ${expires}, NULL, ${`${PORTAL_PREVIEW_CREATED_BY}:${admin.email}`})
    RETURNING id
  `) as unknown as { id: string }[];

  const res = NextResponse.json({ ok: true, url: parsed.data.invoice_id ? `/portal/invoices/${parsed.data.invoice_id}` : '/portal' });
  const base = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(PORTAL_PREVIEW_TTL_MS / 1000),
  };
  res.cookies.set({ name: PORTAL_SESSION_COOKIE, value: rows[0].id, ...base });
  res.cookies.set({ name: PORTAL_PREVIEW_COOKIE, value: '1', ...base });
  return res;
});
