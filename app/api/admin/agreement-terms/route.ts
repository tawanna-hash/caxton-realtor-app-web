// app/api/admin/agreement-terms/route.ts — dated versions of the Advertising Agreement Terms.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { addTermsVersion, getTermsVersions } from '@/lib/server/agreement-terms-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ versions: await getTermsVersions() });
  } catch (err) {
    return NextResponse.json({ error: 'load failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}

export const POST = withAdminTracking(async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let b: { body?: unknown; effective_at?: unknown; note?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
  const text = typeof b.body === 'string' ? b.body.trim() : '';
  if (text.length < 200) return NextResponse.json({ error: 'Terms text is too short.' }, { status: 400 });
  const eff = b.effective_at ? new Date(String(b.effective_at)) : new Date();
  if (Number.isNaN(eff.getTime())) return NextResponse.json({ error: 'Invalid effective date.' }, { status: 400 });
  const note = typeof b.note === 'string' ? b.note.slice(0, 200) : '';
  try {
    await addTermsVersion(text, eff, note, admin.email);
    return NextResponse.json({ versions: await getTermsVersions() });
  } catch (err) {
    return NextResponse.json({ error: 'save failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
});
