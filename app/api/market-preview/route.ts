// Tells the client whether the signed-in account may preview the
// pre-launch Dallas/Ft. Worth market, and sets/clears the display cookie
// read by lib/market-preview.ts.

import { NextResponse } from 'next/server';
import { canViewDallasPreview } from '@/lib/server/dallas-preview';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const dallas = await canViewDallasPreview();
  const res = NextResponse.json({ dallas }, { headers: { 'Cache-Control': 'private, no-store' } });
  if (dallas) {
    res.cookies.set('caxton_dallas_preview', '1', { path: '/', maxAge: 60 * 60 * 24 * 30, sameSite: 'lax' });
  } else {
    res.cookies.set('caxton_dallas_preview', '', { path: '/', maxAge: 0, sameSite: 'lax' });
  }
  return res;
}
