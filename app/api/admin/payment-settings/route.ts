// app/api/admin/payment-settings/route.ts — Get Paid payment settings (fees + Stripe Checkout options).

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { loadPaymentSettings, savePaymentSettings, DEFAULT_PAYMENT_SETTINGS } from '@/lib/server/payment-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ settings: await loadPaymentSettings(true), defaults: DEFAULT_PAYMENT_SETTINGS });
}

export const PUT = withAdminTracking(async function PUT(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
  try {
    return NextResponse.json({ settings: await savePaymentSettings(body) });
  } catch (err) {
    return NextResponse.json({ error: 'save failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
});
