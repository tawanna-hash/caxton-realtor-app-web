import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { apStatusFor } from '@/lib/server/ap-requests';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ids = (req.nextUrl.searchParams.get('ids') ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 500);
  return NextResponse.json({ byAgreement: await apStatusFor(ids) });
}
