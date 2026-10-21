import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { DEFAULT_BUSINESS, ensureBusinessTables, loadBusinessDetails, type BusinessDetails } from '@/lib/server/business-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ details: await loadBusinessDetails() });
}

// Partial update: send only the section being saved.
export async function PUT(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Partial<BusinessDetails>;
  const cur = await loadBusinessDetails();
  const next: BusinessDetails = { ...cur };
  for (const k of Object.keys(DEFAULT_BUSINESS) as Array<keyof BusinessDetails>) {
    if (!(k in body)) continue;
    const v = body[k];
    if (typeof DEFAULT_BUSINESS[k] === 'boolean') (next[k] as boolean) = Boolean(v);
    else if (k === 'colors') { if (Array.isArray(v)) next.colors = v.slice(0, 3).map((c) => String(c)); }
    else if (typeof v === 'string') (next[k] as string) = v.slice(0, k === 'logo' ? 2_800_000 : 300);
  }
  if (next.logo && !next.logo.startsWith('data:image/png') && !next.logo.startsWith('data:image/jpeg')) return NextResponse.json({ error: 'Logo must be a PNG or JPEG.' }, { status: 400 });
  if (!next.name.trim()) return NextResponse.json({ error: 'Business name is required.' }, { status: 400 });
  await ensureBusinessTables();
  await getSql()`INSERT INTO business_settings (id, data, updated_by) VALUES (1, ${JSON.stringify(next)}::jsonb, ${admin.email ?? null})
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now(), updated_by = EXCLUDED.updated_by`;
  return NextResponse.json({ ok: true, details: next });
}
