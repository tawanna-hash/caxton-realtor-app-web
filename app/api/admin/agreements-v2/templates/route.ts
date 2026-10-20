// app/api/admin/agreements-v2/templates/route.ts — Agreements (Beta) templates.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { createTemplate, listTemplates } from '@/lib/agreements-v2/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ templates: await listTemplates() });
  } catch (err) {
    return NextResponse.json({ error: 'list failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}

export const POST = withAdminTracking(async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 120) : '';
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const rate = typeof b.ad_rate_cents === 'number' && Number.isSafeInteger(b.ad_rate_cents) && b.ad_rate_cents > 0 ? b.ad_rate_cents : null;
  try {
    const t = await createTemplate({
      name,
      ad_size: typeof b.ad_size === 'string' && b.ad_size.trim() ? b.ad_size.trim() : null,
      frequency: typeof b.frequency === 'string' && b.frequency.trim() ? b.frequency.trim() : null,
      ad_rate_cents: rate,
    });
    return NextResponse.json({ template: t }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'create failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
});
