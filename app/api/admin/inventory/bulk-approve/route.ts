// app/api/admin/inventory/bulk-approve/route.ts
//
// Bulk-approve every pending builder_inventory submission (status -> active).
// Powers the "Approve all pending" action on /admin/inventory: open all
// builder/developer content at once instead of reviewing each row.
//
// Auth: inline check via getCurrentAdmin — the admin email is recorded as
// reviewed_by on every activated row (mirrors the per-row PATCH flow).

import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { bulkApprovePendingBuilderInventory } from '@/lib/builder-inventory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  let adminEmail: string | null = null;
  try {
    const admin = await getCurrentAdmin();
    adminEmail = admin?.email ?? null;
  } catch {
    adminEmail = null;
  }
  if (!adminEmail) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    );
  }

  try {
    const activated = await bulkApprovePendingBuilderInventory(adminEmail);
    return NextResponse.json({ ok: true, activated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[admin/inventory/bulk-approve POST] error:', msg);
    return NextResponse.json(
      { ok: false, error: 'Bulk approve failed' },
      { status: 500 },
    );
  }
}
