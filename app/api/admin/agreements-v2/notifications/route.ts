// app/api/admin/agreements-v2/notifications/route.ts — Agreements (Beta) notification toggles.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { NOTIFICATION_EVENTS, getNotifications, saveNotifications } from '@/lib/agreements-v2/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ events: NOTIFICATION_EVENTS, settings: await getNotifications() });
}

export const PUT = withAdminTracking(async function PUT(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
  try {
    return NextResponse.json({ settings: await saveNotifications(body) });
  } catch (err) {
    return NextResponse.json({ error: 'save failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
});
