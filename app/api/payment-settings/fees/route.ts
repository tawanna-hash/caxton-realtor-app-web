// Public: current processing fee rates, used by checkout previews.
import { NextResponse } from 'next/server';
import { loadPaymentSettings } from '@/lib/server/payment-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { fees } = await loadPaymentSettings();
  return NextResponse.json({ fees });
}
