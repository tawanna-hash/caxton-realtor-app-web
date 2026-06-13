// app/api/admin/publication-settings/route.ts
//
// GET  — return every publication's settings (for the admin UI).
// PATCH — update one publication's settings.
//
// Currently the only setting we expose is `ga_measurement_id` (a GA4
// "G-XXXXXXX" string) used to wire each publication's magazines up to
// the right Google Analytics property. The table is keyed by
// `publication` ('austin' | 'san_antonio').

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PUBLICATIONS = ['austin', 'san_antonio'] as const;
type Publication = (typeof PUBLICATIONS)[number];

type SettingsRow = {
  publication: Publication;
  ga_measurement_id: string | null;
  updated_at: string;
};

/** A GA4 Measurement ID looks like 'G-XXXXXXXXXX'. Empty string clears it. */
function normalizeMeasurementId(input: unknown): string | null {
  if (input == null) return null;
  const s = String(input).trim();
  if (s === '') return null;
  // Loose validation — let the user paste in whatever GA gives them,
  // but trim whitespace and reject obvious junk.
  if (!/^G-[A-Z0-9]+$/i.test(s)) {
    throw new Error('Measurement ID must look like G-XXXXXXX');
  }
  return s.toUpperCase();
}

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT publication, ga_measurement_id, updated_at
      FROM publication_settings
     ORDER BY publication
  `) as unknown as SettingsRow[];
  return NextResponse.json({ settings: rows });
}

export async function PATCH(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { publication?: string; ga_measurement_id?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const publication = (body.publication || '').toLowerCase();
  if (!PUBLICATIONS.includes(publication as Publication)) {
    return NextResponse.json(
      { error: 'invalid publication', allowed: PUBLICATIONS },
      { status: 400 },
    );
  }

  let measurementId: string | null;
  try {
    measurementId = normalizeMeasurementId(body.ga_measurement_id);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'invalid measurement id' },
      { status: 400 },
    );
  }

  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO publication_settings (publication, ga_measurement_id, updated_at)
    VALUES (${publication}, ${measurementId}, NOW())
    ON CONFLICT (publication) DO UPDATE
      SET ga_measurement_id = EXCLUDED.ga_measurement_id,
          updated_at        = NOW()
  `;
  const rows = (await sql`
    SELECT publication, ga_measurement_id, updated_at
      FROM publication_settings
     WHERE publication = ${publication}
  `) as unknown as SettingsRow[];
  return NextResponse.json({ settings: rows[0] });
}
