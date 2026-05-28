// app/api/admin/advertisers/picker/route.ts
//
// Phase 6: lightweight advertiser list endpoint for the hotspot editor's
// advertiser picker. Returns id/name/slug/publication only — no stats —
// so the modal opens fast.
//
// The hotspot editor uses this on mount to populate the dropdown.
// For inline creation of a new advertiser, the modal POSTs to the
// existing /api/admin/advertisers endpoint.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.myrealtyline.com';

type PickerAdvertiser = {
  id: number;
  name: string;
  slug: string;
  publication: 'austin' | 'san_antonio' | 'both';
};

async function isAdmin(cookieHeader: string | null): Promise<boolean> {
  if (!cookieHeader) return false;
  try {
    const r = await fetch(`${API_URL}/admin/auth/me`, {
      method: 'GET',
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    return r.ok;
  } catch {
    return false;
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export async function GET(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie');
  if (!(await isAdmin(cookieHeader))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await ensureSchema();
    const sql = getSql();
    // The advertisers table + publication column exist after Phase 4. If the
    // publication column hasn't been added yet (fresh DB), the query will
    // throw — but in practice ensureSchema runs first and Phase 4's lazy
    // ensurePublicationColumn runs on first call to /api/admin/advertisers.
    const rows = (await sql`
      SELECT id, name, slug, COALESCE(publication, 'austin') AS publication
      FROM advertisers
      ORDER BY name ASC
    `) as unknown as PickerAdvertiser[];
    return NextResponse.json({ advertisers: rows });
  } catch (err: unknown) {
    console.error('[admin/advertisers/picker GET] failed:', errMessage(err));
    return NextResponse.json(
      { error: 'database error', detail: errMessage(err) },
      { status: 500 },
    );
  }
}
