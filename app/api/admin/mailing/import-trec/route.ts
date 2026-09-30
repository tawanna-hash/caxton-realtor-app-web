// app/api/admin/mailing/import-trec/route.ts
//
// POST — pull the public TREC license-holder file and add active DFW
// sales agents + brokers to the 'dallas-trec' / 'fortworth-trec'
// mailing segments. Admin-only. Idempotent (skips licenses already listed).

import { NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { importTrecDfw } from '@/lib/server/mailing/trec-import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await ensureSchema();
    const result = await importTrecDfw();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'import failed' },
      { status: 500 },
    );
  }
}
