// app/api/admin/agreements-v2/defaults/route.ts — Agreements (Beta) default settings.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { getDefaults, saveDefaults } from '@/lib/agreements-v2/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ defaults: await getDefaults() });
}

export const PUT = withAdminTracking(async function PUT(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
  try {
    return NextResponse.json({ defaults: await saveDefaults(body) });
  } catch (err) {
    return NextResponse.json({ error: 'save failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
});
