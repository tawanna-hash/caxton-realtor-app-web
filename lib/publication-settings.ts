// lib/publication-settings.ts
//
// Server-side helper for reading per-publication settings (currently
// just the GA4 Measurement ID). Used by the public magazine pages so
// they can inject the right tag without exposing the full admin
// settings table to the public.

import { ensureSchema, getSql } from '@/lib/db';
import type { PublicationId } from '@/lib/publications';

export type PublicationKey = PublicationId;

export async function getMeasurementId(
  publication: PublicationKey,
): Promise<string | null> {
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT ga_measurement_id
        FROM publication_settings
       WHERE publication = ${publication}
       LIMIT 1
    `) as unknown as Array<{ ga_measurement_id: string | null }>;
    return rows[0]?.ga_measurement_id ?? null;
  } catch (err) {
    // Settings table missing or DB unreachable — fail open so the
    // magazine page still renders without analytics.
    console.warn('[publication-settings] getMeasurementId failed:', err);
    return null;
  }
}
