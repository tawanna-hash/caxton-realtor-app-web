import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { clearW9Profile, companyScope, listW9Partners, loadW9Profile, partnerScope, saveW9Profile } from '@/lib/server/w9-profile';
import type { W9Data } from '@/lib/w9';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function scopeOf(raw: string | null | undefined): { scope: string; advertiserId: number | null } | null {
  if (!raw || raw === 'company') return { scope: companyScope, advertiserId: null };
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? { scope: partnerScope(n), advertiserId: n } : null;
}

const schema = z.object({
  partner: z.string().max(12).optional(),
  data: z.object({
    name: z.string().max(200), businessName: z.string().max(200),
    classification: z.enum(['individual', 'c_corp', 's_corp', 'partnership', 'trust_estate', 'llc', 'other', '']),
    llcTaxClass: z.enum(['C', 'S', 'P', '']), otherText: z.string().max(100),
    foreignOwners: z.boolean(), exemptPayeeCode: z.string().max(10), fatcaCode: z.string().max(10),
    address: z.string().max(200), cityStateZip: z.string().max(200), requester: z.string().max(300),
    accountNumbers: z.string().max(200), tinType: z.enum(['ssn', 'ein']), tin: z.string().max(20),
    certified: z.boolean(), signedDate: z.string().max(10),
  }),
  signature: z.object({ dataUrl: z.string().max(3_000_000).regex(/^data:image\/(png|jpe?g);base64,/), x: z.number(), y: z.number(), w: z.number() }).nullable(),
});

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = req.nextUrl.searchParams;
  if (url.get('partners')) return NextResponse.json({ partners: await listW9Partners() }, { headers: { 'Cache-Control': 'no-store' } });
  const sc = scopeOf(url.get('partner'));
  if (!sc) return NextResponse.json({ error: 'Invalid partner.' }, { status: 400 });
  return NextResponse.json({ profile: await loadW9Profile(sc.scope) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'Invalid W-9 data.' }, { status: 400 });
  const sc = scopeOf(p.data.partner);
  if (!sc) return NextResponse.json({ error: 'Invalid partner.' }, { status: 400 });
  await saveW9Profile(sc.scope, sc.advertiserId, p.data.data as W9Data, p.data.signature, admin.email ?? null);
  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
}

export async function DELETE(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sc = scopeOf(req.nextUrl.searchParams.get('partner'));
  if (!sc) return NextResponse.json({ error: 'Invalid partner.' }, { status: 400 });
  await clearW9Profile(sc.scope);
  return NextResponse.json({ ok: true });
}
