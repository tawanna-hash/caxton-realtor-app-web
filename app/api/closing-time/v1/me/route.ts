import { NextResponse } from 'next/server';
import { realtorIdForApiKey } from '@/lib/server/closing-time-automation';
import { getRealtorMe } from '@/lib/server/realtors-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const H = { 'Cache-Control': 'private, no-store, max-age=0' };

// Connection test used by automation tools. Returns who the API key belongs to.
export async function GET(req: Request): Promise<Response> {
  const realtorId = await realtorIdForApiKey(req.headers.get('authorization'));
  if (!realtorId) return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401, headers: H });
  const me = await getRealtorMe(realtorId);
  const name = [me?.first_name, me?.last_name].filter(Boolean).join(' ');
  return NextResponse.json({ id: realtorId, name: name || null, email: me?.email ?? null }, { headers: H });
}
