// app/api/admin/mailing/holding/bulk/route.ts
//
// POST — Bulk actions over holding-stage mailing rows scoped by external_source.
//   { action: 'dedupe',              source: 'ramco-sabor' | 'unlockmls' }
//   { action: 'delete-all-in-source', source: 'ramco-sabor' | 'unlockmls', confirm: 'DELETE_ALL' }

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { ensureSchema } from '@/lib/db';
import {
  deleteAllHoldingForSource,
  dedupeHoldingForSource,
} from '@/lib/server/mailing/advertiser-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ALLOWED_SOURCES = new Set(['ramco-sabor', 'unlockmls']);

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  type Body = { action?: string; source?: string; confirm?: string };
  let body: Body = {};
  try {
    body = ((await req.json()) ?? {}) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const action = body.action;
  const source = body.source;

  if (typeof source !== 'string' || !ALLOWED_SOURCES.has(source)) {
    return NextResponse.json(
      { error: 'invalid or missing source (expected ramco-sabor or unlockmls)' },
      { status: 400 },
    );
  }

  try {
    await ensureSchema();

    if (action === 'dedupe') {
      const result = await dedupeHoldingForSource(source);
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === 'delete-all-in-source') {
      if (body.confirm !== 'DELETE_ALL') {
        return NextResponse.json(
          { error: 'confirm must equal DELETE_ALL' },
          { status: 400 },
        );
      }
      const removed = await deleteAllHoldingForSource(source);
      return NextResponse.json({ ok: true, removed });
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: errMessage(err) }, { status: 500 });
  }
}
