// app/api/admin/crm-email/preview/route.ts
//
// POST — resolve a CRM filter into a recipient count + sample rows.
// Used by CrmComposer for the live audience preview.

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { resolveCrmAudience, type CrmAudienceFilter } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await ensureSchema();
    const body = await req.json() as { filter?: CrmAudienceFilter };
    const filter = body.filter ?? {};
    const rows = await resolveCrmAudience(filter);
    return NextResponse.json({
      count: rows.length,
      sample: rows.slice(0, 25).map((r) => ({
        id: r.id,
        email: r.email,
        first_name: r.first_name,
        last_name: r.last_name,
        company: r.company,
        publication: r.publication,
        status: r.status,
        type: r.type,
      })),
      ids: rows.map((r) => r.id),
    });
  } catch (err) {
    return NextResponse.json({
      error: 'preview failed',
      detail: err instanceof Error ? err.message : 'error',
    }, { status: 500 });
  }
}
