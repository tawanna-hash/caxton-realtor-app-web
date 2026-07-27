// app/api/admin/mailing/holding/update/route.ts
//
// POST /api/admin/mailing/holding/update
//   Body: { id, first_name?, last_name?, title?, email?, company?,
//           address?, address_2?, city?, state?, zip?,
//           license_number?, phone?, mobile_phone?, email_notes? }
//   Updates any subset of fields on a holding-stage row. If the address
//   or email changes, the corresponding verification status is reset
//   to 'Pending' so the user is forced to re-verify.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import { updateHoldingContact, type HoldingEditInput } from '@/lib/mailing';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { uuidSchema, parseJson } from '@/lib/server/schemas/_common';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Each editable field accepts a string or null. The transform step below
// trims and converts blank → null for short fields, with a softer
// strip for the multi-line `email_notes` text.
const editableString = z.string().nullable().optional();

const updateHoldingSchema = z.object({
  id:             uuidSchema,
  first_name:     editableString,
  last_name:      editableString,
  title:          editableString,
  email:          editableString,
  company:        editableString,
  address:        editableString,
  address_2:      editableString,
  city:           editableString,
  state:          editableString,
  zip:            editableString,
  license_number: editableString,
  phone:          editableString,
  mobile_phone:   editableString,
  email_notes:    editableString,
});

const EDITABLE_KEYS: (keyof HoldingEditInput)[] = [
  'first_name', 'last_name', 'title', 'email', 'company',
  'address', 'address_2', 'city', 'state', 'zip',
  'license_number', 'phone', 'mobile_phone',
  'email_notes',
];

function normalize(value: string | null | undefined, key: keyof HoldingEditInput): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  // `email_notes` is multi-line free text — collapse only leading/trailing
  // blank lines. Everything else gets a hard trim and converts blank to NULL.
  if (key === 'email_notes') {
    const stripped = value.replace(/^\s+|\s+$/g, '');
    return stripped === '' ? null : stripped;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export const POST = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  await ensureSchema();

  const parsed = await parseJson(req, updateHoldingSchema);
  const { id, ...rest } = parsed;

  const edits: HoldingEditInput = {};
  for (const k of EDITABLE_KEYS) {
    const raw = (rest as Record<string, string | null | undefined>)[k];
    const normalized = normalize(raw, k);
    if (normalized !== undefined) {
      (edits as Record<string, string | null>)[k] = normalized;
    }
  }

  if (Object.keys(edits).length === 0) {
    throw new ApiError(400, 'no editable fields supplied');
  }

  const row = await updateHoldingContact(id, edits);
  if (!row) throw new ApiError(404, 'not found');
  return NextResponse.json({ ok: true, row });
});
