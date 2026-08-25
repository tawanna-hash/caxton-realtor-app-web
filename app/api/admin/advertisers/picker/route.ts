// app/api/admin/advertisers/picker/route.ts
//
// Phase 6: lightweight advertiser list endpoint for the hotspot editor's
// advertiser picker. Returns id/name/slug/publication only — no stats —
// so the modal opens fast.
//
// The hotspot editor uses this on mount to populate the dropdown.
// For inline creation of a new advertiser, the modal POSTs to the
// existing /api/admin/advertisers endpoint.

import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import type { PublicationScope } from '@/lib/publications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PickerAdvertiser = {
  id: number;
  name: string;
  slug: string;
  publication: PublicationScope;
};

async function isAdmin(): Promise<boolean> {
  try {
    const admin = await getCurrentAdmin();
    return admin !== null;
  } catch {
    return false;
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export async function GET() {
  if (!(await isAdmin())) {
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
