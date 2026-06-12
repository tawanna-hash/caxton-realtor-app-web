// lib/server/advertiser-import-insert.ts
//
// Shared insert path used by both /import-screenshot and /import-data.
// Takes an extracted { locations, staff } payload and writes rows to
// advertiser_locations, advertiser_staff, and advertiser_staff_locations,
// plus best-effort mailing-list sync per staff member.

import { getSql, ensureSchema } from '@/lib/db';
import { formatPhone } from '@/lib/format-phone';
import { toTitleCaseName, toTitleCaseRole } from '@/lib/format-name';
import { upsertStaffMailingByStaffId } from '@/lib/mailing';
import type {
  ExtractedLocation,
  ExtractedStaffMember,
} from './gemini-screenshot-extract';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export interface ImportInsertCounts {
  locations: number;
  staff: number;
}

/**
 * Bulk-insert locations + staff for an advertiser.
 * - At most one location is flagged is_primary (and only if the advertiser
 *   doesn't already have a primary location).
 * - staff[i].location_index is 1-based and refers to the locations[] array
 *   in the same payload (NOT existing locations in the DB).
 */
export async function insertExtractedAdvertiserData(args: {
  advertiserId: number;
  extracted: { locations: ExtractedLocation[]; staff: ExtractedStaffMember[] };
}): Promise<ImportInsertCounts> {
  const { advertiserId, extracted } = args;

  await ensureSchema();
  const sql = getSql();

  const existingPrimary = (await sql`
    SELECT id FROM advertiser_locations
    WHERE advertiser_id = ${advertiserId} AND is_primary = true
    LIMIT 1
  `) as unknown as Array<{ id: string }>;

  let primaryAssigned = existingPrimary.length > 0;

  const insertedLocationIds: string[] = [];
  for (let i = 0; i < extracted.locations.length; i++) {
    const loc = extracted.locations[i];
    const shouldBePrimary = !primaryAssigned && loc.is_primary;
    if (shouldBePrimary) primaryAssigned = true;

    // Title-case the label too ("HARTLAND PLAZA" -> "Hartland Plaza").
    const normalizedLabel = loc.label ? toTitleCaseRole(loc.label) : null;

    const rows = (await sql`
      INSERT INTO advertiser_locations (
        advertiser_id, label, address, address_2, city, state, zip,
        phone, email, hours, is_primary, sort_order
      ) VALUES (
        ${advertiserId},
        ${normalizedLabel},
        ${loc.address},
        ${loc.address_2},
        ${loc.city},
        ${loc.state},
        ${loc.zip},
        ${loc.phone ? (formatPhone(loc.phone) || loc.phone) : null},
        ${loc.email ? loc.email.toLowerCase() : null},
        ${loc.hours},
        ${shouldBePrimary},
        ${i}
      )
      RETURNING id
    `) as unknown as Array<{ id: string }>;
    insertedLocationIds.push(rows[0].id);
  }

  let staffInserted = 0;
  for (let i = 0; i < extracted.staff.length; i++) {
    const s = extracted.staff[i];
    if (!s.name) continue;

    // Title-case the imported name + role (sources often render in ALL CAPS).
    const normalizedName = toTitleCaseName(s.name);
    const normalizedTitle = s.title ? toTitleCaseRole(s.title) : null;

    const rows = (await sql`
      INSERT INTO advertiser_staff (
        advertiser_id, name, title, email, phone, photo_url, sort_order
      ) VALUES (
        ${advertiserId},
        ${normalizedName},
        ${normalizedTitle},
        ${s.email ? s.email.toLowerCase() : null},
        ${s.phone ? (formatPhone(s.phone) || s.phone) : null},
        ${s.photo_url},
        ${i}
      )
      RETURNING id
    `) as unknown as Array<{ id: string }>;

    const staffId = rows[0].id;
    staffInserted++;

    if (
      s.location_index !== null &&
      s.location_index >= 1 &&
      s.location_index <= insertedLocationIds.length
    ) {
      const locId = insertedLocationIds[s.location_index - 1];
      await sql`
        INSERT INTO advertiser_staff_locations (staff_id, location_id)
        VALUES (${staffId}::uuid, ${locId}::uuid)
        ON CONFLICT DO NOTHING
      `;
    }

    try {
      await upsertStaffMailingByStaffId(staffId);
    } catch (err) {
      console.warn('[advertiser-import-insert] mailing upsert failed:', errMessage(err));
    }
  }

  return {
    locations: insertedLocationIds.length,
    staff: staffInserted,
  };
}
