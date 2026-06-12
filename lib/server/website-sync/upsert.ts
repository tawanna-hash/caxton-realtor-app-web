// lib/server/website-sync/upsert.ts
//
// Idempotent upsert path for website-sync data. Unlike the import flow
// (which always INSERTs and is expected to be run once per imported file),
// "Sync from website" can be clicked repeatedly without creating
// duplicates.
//
// Match rules:
//   - Locations: matched on (advertiser_id, normalized_label) first; if no
//     match, fall back to (advertiser_id, normalized address line).
//   - Staff:     matched on (advertiser_id, lower(email)). If the incoming
//                row has no email, matched on (advertiser_id, normalized name).
//
// Existing rows are UPDATEd in place (non-empty fields only — we never
// blank out a value with NULL from the sync). New rows are INSERTed.
// Rows present in the DB but not in the sync payload are left alone — the
// admin can still delete them manually.

import { getSql, ensureSchema } from '@/lib/db';
import { formatPhone } from '@/lib/format-phone';
import { toTitleCaseName, toTitleCaseRole } from '@/lib/format-name';
import { upsertStaffMailingByStaffId } from '@/lib/mailing';
import type {
  ExtractedLocation,
  ExtractedStaffMember,
} from '../gemini-screenshot-extract';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export interface SyncCounts {
  locationsInserted: number;
  locationsUpdated: number;
  staffInserted: number;
  staffUpdated: number;
}

function norm(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

interface DbLocationRow {
  id: string;
  label: string | null;
  address: string | null;
}

interface DbStaffRow {
  id: string;
  name: string;
  email: string | null;
}

export async function syncAdvertiserFromWebsite(args: {
  advertiserId: number;
  data: { locations: ExtractedLocation[]; staff: ExtractedStaffMember[] };
}): Promise<SyncCounts> {
  const { advertiserId, data } = args;

  await ensureSchema();
  const sql = getSql();

  const counts: SyncCounts = {
    locationsInserted: 0,
    locationsUpdated: 0,
    staffInserted: 0,
    staffUpdated: 0,
  };

  // -------- LOCATIONS --------
  const existingLocs = (await sql`
    SELECT id, label, address
    FROM advertiser_locations
    WHERE advertiser_id = ${advertiserId}
  `) as unknown as DbLocationRow[];

  const hasExistingPrimary = (
    (await sql`
      SELECT 1 FROM advertiser_locations
      WHERE advertiser_id = ${advertiserId} AND is_primary = true
      LIMIT 1
    `) as unknown as Array<unknown>
  ).length > 0;
  let primaryAssigned = hasExistingPrimary;

  // Map incoming label -> DB row (for staff linking).
  const labelToLocId = new Map<string, string>();
  for (const r of existingLocs) {
    if (r.label) labelToLocId.set(norm(r.label), r.id);
  }

  for (let i = 0; i < data.locations.length; i++) {
    const loc = data.locations[i];
    const normalizedLabel = loc.label ? toTitleCaseRole(loc.label) : null;
    const normalizedPhone = loc.phone ? (formatPhone(loc.phone) || loc.phone) : null;
    const normalizedEmail = loc.email ? loc.email.toLowerCase() : null;

    // Find a match: by label first, then by address.
    let match = existingLocs.find(
      (r) => normalizedLabel && norm(r.label) === norm(normalizedLabel),
    );
    if (!match && loc.address) {
      match = existingLocs.find((r) => norm(r.address) === norm(loc.address));
    }

    if (match) {
      // UPDATE — only fill fields that were empty in the DB, or that
      // changed; never blank a non-empty DB value with a NULL incoming.
      await sql`
        UPDATE advertiser_locations SET
          label     = COALESCE(${normalizedLabel}, label),
          address   = COALESCE(${loc.address}, address),
          address_2 = COALESCE(${loc.address_2}, address_2),
          city      = COALESCE(${loc.city}, city),
          state     = COALESCE(${loc.state}, state),
          zip       = COALESCE(${loc.zip}, zip),
          phone     = COALESCE(${normalizedPhone}, phone),
          email     = COALESCE(${normalizedEmail}, email),
          hours     = COALESCE(${loc.hours}, hours),
          updated_at = now()
        WHERE id = ${match.id}::uuid
      `;
      counts.locationsUpdated++;
      if (normalizedLabel) labelToLocId.set(norm(normalizedLabel), match.id);
    } else {
      // INSERT
      const shouldBePrimary = !primaryAssigned && loc.is_primary;
      if (shouldBePrimary) primaryAssigned = true;

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
          ${normalizedPhone},
          ${normalizedEmail},
          ${loc.hours},
          ${shouldBePrimary},
          ${existingLocs.length + i}
        )
        RETURNING id
      `) as unknown as Array<{ id: string }>;
      counts.locationsInserted++;
      if (normalizedLabel) labelToLocId.set(norm(normalizedLabel), rows[0].id);
      existingLocs.push({
        id: rows[0].id,
        label: normalizedLabel,
        address: loc.address,
      });
    }
  }

  // -------- STAFF --------
  const existingStaff = (await sql`
    SELECT id, name, email
    FROM advertiser_staff
    WHERE advertiser_id = ${advertiserId}
  `) as unknown as DbStaffRow[];

  // Build incoming-location lookup so we can resolve location_index -> uuid.
  // location_index is 1-based and refers to data.locations[] order.
  const incomingLocationIds: (string | null)[] = data.locations.map((loc) => {
    if (loc.label) return labelToLocId.get(norm(loc.label)) ?? null;
    return null;
  });

  for (const s of data.staff) {
    if (!s.name) continue;
    const normalizedName = toTitleCaseName(s.name);
    const normalizedTitle = s.title ? toTitleCaseRole(s.title) : null;
    const normalizedEmail = s.email ? s.email.toLowerCase() : null;
    const normalizedPhone = s.phone ? (formatPhone(s.phone) || s.phone) : null;

    // Match priority: email exact > name exact.
    let match: DbStaffRow | undefined;
    if (normalizedEmail) {
      match = existingStaff.find((r) => norm(r.email) === normalizedEmail);
    }
    if (!match) {
      match = existingStaff.find((r) => norm(r.name) === norm(normalizedName));
    }

    let staffId: string;
    if (match) {
      await sql`
        UPDATE advertiser_staff SET
          name      = ${normalizedName},
          title     = COALESCE(${normalizedTitle}, title),
          email     = COALESCE(${normalizedEmail}, email),
          phone     = COALESCE(${normalizedPhone}, phone),
          photo_url = COALESCE(${s.photo_url}, photo_url),
          updated_at = now()
        WHERE id = ${match.id}::uuid
      `;
      staffId = match.id;
      counts.staffUpdated++;
    } else {
      const rows = (await sql`
        INSERT INTO advertiser_staff (
          advertiser_id, name, title, email, phone, photo_url, sort_order
        ) VALUES (
          ${advertiserId},
          ${normalizedName},
          ${normalizedTitle},
          ${normalizedEmail},
          ${normalizedPhone},
          ${s.photo_url},
          ${existingStaff.length + counts.staffInserted}
        )
        RETURNING id
      `) as unknown as Array<{ id: string }>;
      staffId = rows[0].id;
      counts.staffInserted++;
      existingStaff.push({
        id: staffId,
        name: normalizedName,
        email: normalizedEmail,
      });
    }

    // Link to location (idempotent via PK).
    if (
      s.location_index !== null &&
      s.location_index >= 1 &&
      s.location_index <= incomingLocationIds.length
    ) {
      const locId = incomingLocationIds[s.location_index - 1];
      if (locId) {
        await sql`
          INSERT INTO advertiser_staff_locations (staff_id, location_id)
          VALUES (${staffId}::uuid, ${locId}::uuid)
          ON CONFLICT DO NOTHING
        `;
      }
    }

    try {
      await upsertStaffMailingByStaffId(staffId);
    } catch (err) {
      console.warn('[website-sync] mailing upsert failed:', errMessage(err));
    }
  }

  return counts;
}
