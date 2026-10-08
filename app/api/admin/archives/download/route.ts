import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { query } from '@/lib/server/db/neon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Admin only: the four-year archive of a closed Closing Time deal (deal file, audit report, documents) as one zip. */
export async function GET(req: Request): Promise<Response> {
  await requireAdmin();
  const url = new URL(req.url);
  const realtor = url.searchParams.get('realtor') ?? '';
  const deal = url.searchParams.get('deal') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(realtor) || !deal) return NextResponse.json({ error: 'Missing archive.' }, { status: 400 });
  const rows = await query<{ property: string; zip: Buffer }>(`SELECT property, zip FROM closing_time_platform_archives WHERE realtor_id=$1 AND deal_id=$2`, [realtor, deal]);
  if (!rows[0]) return NextResponse.json({ error: 'No archive for that deal.' }, { status: 404 });
  const name = `${rows[0].property.replace(/[^\w.\- ]+/g, ' ').trim().slice(0, 80) || 'Deal'} - Closing Time File.zip`;
  return new Response(new Uint8Array(rows[0].zip), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store' } });
}
