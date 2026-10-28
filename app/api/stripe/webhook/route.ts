// Stripe has been removed. This endpoint no longer processes anything.
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json({ error: 'Stripe webhooks are disabled.' }, { status: 410 });
}
