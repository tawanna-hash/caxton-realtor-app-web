/**
 * POST /api/admin/events/gmail/share
 * Admin-only. Mints a signed share token and returns a public URL.
 * Recipients see a read-only rendering of whatever pending events look
 * like when they open the link.
 */

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { signGmailShareToken, GMAIL_SHARE_TOKEN_TTL_SECONDS } from '@/lib/server/gmail-share-token';

export const runtime = 'nodejs';

export const POST = withAdminTracking(async () => {
  const admin = await requireAdmin();
  const token = signGmailShareToken(admin.adminId);
  const h = await headers();
  const host = h.get('host') ?? 'realtynewsnow.app';
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const base = process.env.NEXT_PUBLIC_SITE_URL || `${proto}://${host}`;
  const url = `${base}/admin/events/gmail/shared/${encodeURIComponent(token)}`;
  return NextResponse.json({ url, expiresInSeconds: GMAIL_SHARE_TOKEN_TTL_SECONDS });
});
