/** GET /api/closing-time/features - which feature switches are on. Switches are not sensitive. */
import { NextResponse } from 'next/server';
import { enabledFeatureKeys } from '@/lib/server/platform-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try { return NextResponse.json({ enabled: await enabledFeatureKeys() }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ enabled: [] }); }
}
