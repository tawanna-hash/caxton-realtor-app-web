import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { invoiceHistoryUrl } from '@/lib/server/invoice-history-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/advertisers/[id]/history-link: permanent shareable invoice-history link for a partner. */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const advertiserId = Number(id);
  if (!Number.isInteger(advertiserId) || advertiserId <= 0) {
    return NextResponse.json({ error: 'invalid partner id' }, { status: 400 });
  }
  try {
    return NextResponse.json({ url: invoiceHistoryUrl(advertiserId) });
  } catch {
    return NextResponse.json({ error: 'Could not create the link.' }, { status: 500 });
  }
}
