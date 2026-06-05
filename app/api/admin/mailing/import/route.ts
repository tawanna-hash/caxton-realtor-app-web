// app/api/admin/mailing/import/route.ts
//
// POST — bulk import rows into a mailing segment.
//
// Accepts JSON body:
//   { segment: 'manual-newsline', rows: [{...}, ...] }   <- already-parsed rows
//
// Rows are normalized + filtered (must have first_name OR email) and
// inserted in a single multi-row INSERT for speed. Duplicates within the
// import (same email case-insensitive) are skipped, but matching against
// pre-existing rows is left to the dedupe action.

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { isMailingSegment, segmentFromSlug, splitFullName } from '@/lib/mailing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

type ImportRow = {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  title?: string | null;
  license_number?: string | null;
  address?: string | null;
  address_2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  website?: string | null;
  notes?: string | null;
};

function s(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t || null;
}

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const segRaw = typeof body.segment === 'string' ? body.segment : null;
  const segment = segRaw && (isMailingSegment(segRaw) ? segRaw : segmentFromSlug(segRaw));
  if (!segment) {
    return NextResponse.json({ error: 'invalid segment' }, { status: 400 });
  }
  const rawRows = Array.isArray(body.rows) ? (body.rows as ImportRow[]) : null;
  if (!rawRows) {
    return NextResponse.json({ error: 'rows required (array)' }, { status: 400 });
  }
  if (rawRows.length > 50_000) {
    return NextResponse.json({ error: 'too many rows (max 50000)' }, { status: 413 });
  }

  try {
    await ensureSchema();
    const sql = getSql();

    let inserted = 0;
    let skipped = 0;
    const seenEmails = new Set<string>();

    // Insert in small batches to keep SQL statement size reasonable.
    const BATCH = 200;
    for (let i = 0; i < rawRows.length; i += BATCH) {
      const slice = rawRows.slice(i, i + BATCH);
      const values: Array<{
        first_name: string;
        last_name: string | null;
        email: string | null;
        phone: string | null;
        company: string | null;
        title: string | null;
        license_number: string | null;
        address: string | null;
        address_2: string | null;
        city: string | null;
        state: string | null;
        zip: string | null;
        website: string | null;
        notes: string | null;
      }> = [];

      for (const raw of slice) {
        // Resolve first/last from full_name if needed.
        let first_name = s(raw.first_name);
        let last_name  = s(raw.last_name);
        const full     = s(raw.full_name);
        if (!first_name && !last_name && full) {
          const split = splitFullName(full);
          first_name = split.first_name || null;
          last_name  = split.last_name  || null;
        }
        const email = s(raw.email);
        if (!first_name && !email) { skipped += 1; continue; }
        if (email) {
          const k = email.toLowerCase();
          if (seenEmails.has(k)) { skipped += 1; continue; }
          seenEmails.add(k);
        }
        values.push({
          first_name:     first_name || (email ?? '(no name)'),
          last_name,
          email,
          phone:          s(raw.phone),
          company:        s(raw.company),
          title:          s(raw.title),
          license_number: s(raw.license_number),
          address:        s(raw.address),
          address_2:      s(raw.address_2),
          city:           s(raw.city),
          state:          s(raw.state),
          zip:            s(raw.zip),
          website:        s(raw.website),
          notes:          s(raw.notes),
        });
      }

      if (values.length === 0) continue;

      // Multi-row INSERT one row at a time (parameter binding limit safety).
      // Neon serverless handles ~200 parameterized inserts/batch fine.
      for (const v of values) {
        await sql`
          INSERT INTO mailing_contacts
            (segment, first_name, last_name, email, phone, company, title, license_number,
             address, address_2, city, state, zip, website, notes, source, tags)
          VALUES
            (${segment},
             ${v.first_name},
             ${v.last_name},
             ${v.email},
             ${v.phone},
             ${v.company},
             ${v.title},
             ${v.license_number},
             ${v.address},
             ${v.address_2},
             ${v.city},
             ${v.state},
             ${v.zip},
             ${v.website},
             ${v.notes},
             'import',
             ${JSON.stringify([segment])}::jsonb)
        `;
        inserted += 1;
      }
    }

    return NextResponse.json({ ok: true, inserted, skipped });
  } catch (err) {
    console.error('[admin/mailing import]', errMessage(err));
    return NextResponse.json({ error: 'import failed', detail: errMessage(err) }, { status: 500 });
  }
}
