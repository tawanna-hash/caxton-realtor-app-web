// app/api/admin/mailing/holding/update/route.ts
//
// POST /api/admin/mailing/holding/update
//   Body: { id, first_name?, last_name?, title?, email?, company?,
//           address?, address_2?, city?, state?, zip?,
//           license_number?, phone?, mobile_phone? }
//   Updates any subset of fields on a holding-stage row. If the address
//   or email changes, the corresponding verification status is reset
//   to 'Pending' so the user is forced to re-verify.

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { updateHoldingContact, type HoldingEditInput } from '@/lib/mailing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EDITABLE_KEYS: (keyof HoldingEditInput)[] = [
  'first_name', 'last_name', 'title', 'email', 'company',
  'address', 'address_2', 'city', 'state', 'zip',
  'license_number', 'phone', 'mobile_phone',
  'email_notes',
];

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

function pickEdits(body: Record<string, unknown>): HoldingEditInput {
  const out: HoldingEditInput = {};
  for (const k of EDITABLE_KEYS) {
    if (!(k in body)) continue;
    const v = body[k];
    if (v === null) { (out as Record<string, unknown>)[k] = null; continue; }
    if (typeof v === 'string') {
      // email_notes is multi-line free text — don't trim, just
      // collapse leading/trailing blank lines. All other fields get
      // a hard trim and convert blank → NULL.
      if (k === 'email_notes') {
        const stripped = v.replace(/^\s+|\s+$/g, '');
        (out as Record<string, unknown>)[k] = stripped === '' ? null : stripped;
      } else {
        const trimmed = v.trim();
        (out as Record<string, unknown>)[k] = trimmed === '' ? null : trimmed;
      }
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id must be uuid' }, { status: 400 });
  }

  const edits = pickEdits(body);
  if (Object.keys(edits).length === 0) {
    return NextResponse.json({ error: 'no editable fields supplied' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const row = await updateHoldingContact(id, edits);
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ ok: true, row });
  } catch (err) {
    console.error('[admin/mailing/holding/update]', errMessage(err));
    return NextResponse.json({ error: 'update failed', detail: errMessage(err) }, { status: 500 });
  }
}
