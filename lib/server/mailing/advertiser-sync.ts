// lib/server/mailing/advertiser-sync.ts
//
// Sync the active advertisers (and their additional_contacts JSON) into the
// mailing list. Ported from PressBook CRM. Idempotent / add-only.

import { getSql } from '@/lib/db';
import type { MailingSegment } from './segments';
import { splitFullName } from './import-fields';
import type { Sql } from './_internal';
import { parsePublications } from '@/lib/publication-theme';
import { sweepEmailOnlyRouting } from './email-only-routing';

// Map an advertisers.publication CSV string to the set of mailing
// segments it should land in. Houston/Dallas don't have dedicated
// mailing segments yet, so for now they fall back to the ATX bucket
// (RealtyLine umbrella). Update this when -hou / -dal segments exist.
function segmentsForPublication(pubCsv: string | null | undefined): MailingSegment[] {
  const keys = parsePublications(pubCsv);
  const out = new Set<MailingSegment>();
  for (const k of keys) {
    if (k === 'san_antonio') out.add('newsline-sa-print');
    else out.add('realtyline-atx-print'); // austin + houston + dallas (merged ATX print list)
  }
  if (out.size === 0) out.add('realtyline-atx-print');
  return Array.from(out);
}

// ============================================================

// PressBook's sync-helpers.ts walks the contacts(type='client',status='advertiser')
// rows and ensures each one (plus its additional_contacts JSON column)
// has a contacts(type='mailing', tags @> '["advertiser"]') counterpart.
//
// In Caxton the source is the `advertisers` table (which holds both
// "advertiser" and "client" entries — the user already established that
// they're the same thing). We treat status='advertiser' as the eligibility
// filter and additional_contacts JSONB the same way.
// ============================================================

type AdvertiserSyncRow = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  contact_email: string | null;
  portal_email: string | null;
  phone: string | null;
  office_phone: string | null;
  company: string | null;
  title: string | null;
  license_number: string | null;
  address: string | null;
  address_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  website: string | null;
  additional_contacts: unknown;
};

type AdditionalContact = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  address?: string | null;
  address_2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

type MailingSourceRow = {
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
};

function digits(v: string | null | undefined): string {
  return (v ?? '').replace(/[^\d]/g, '');
}

function deriveFirstLast(adv: AdvertiserSyncRow): { first_name: string; last_name: string | null } {
  // Prefer first_name/last_name when present; fall back to splitting name.
  const f = (adv.first_name ?? '').trim();
  const l = (adv.last_name  ?? '').trim();
  if (f || l) return { first_name: f || (l ? '' : ''), last_name: l || null };
  const nm = (adv.name ?? '').trim();
  if (!nm) return { first_name: '', last_name: null };
  const { first_name, last_name } = splitFullName(nm);
  return { first_name, last_name: last_name || null };
}

// Address parts pulled from advertiser_locations as a fallback when the
// advertiser's own address columns are blank. Use the staff member's
// assigned location when available, else the primary location, else the
// first location by sort_order.
export type LocationAddressParts = {
  address: string | null;
  address_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

export async function loadLocationAddressForAdvertiser(
  advertiserId: number,
  opts: { staffId?: string | null } = {},
): Promise<LocationAddressParts | null> {
  const sql = getSql();

  // 1) Staff-assigned location wins when available.
  if (opts.staffId) {
    const rows = (await sql`
      SELECT l.address, l.address_2, l.city, l.state, l.zip
        FROM advertiser_staff_locations sl
        JOIN advertiser_locations l ON l.id = sl.location_id
       WHERE sl.staff_id = ${opts.staffId}::uuid
         AND l.advertiser_id = ${advertiserId}
       ORDER BY l.is_primary DESC NULLS LAST,
                l.sort_order ASC NULLS LAST,
                l.created_at ASC NULLS LAST
       LIMIT 1
    `) as unknown as LocationAddressParts[];
    if (rows[0] && rows[0].address) return rows[0];
  }

  // 2) Primary location, else first location.
  const rows = (await sql`
    SELECT address, address_2, city, state, zip
      FROM advertiser_locations
     WHERE advertiser_id = ${advertiserId}
     ORDER BY is_primary DESC NULLS LAST,
              sort_order ASC NULLS LAST,
              created_at ASC NULLS LAST
     LIMIT 1
  `) as unknown as LocationAddressParts[];
  return rows[0] ?? null;
}

export function mergeAddresses(
  primary: LocationAddressParts,
  fallback: LocationAddressParts | null,
): LocationAddressParts {
  if (!fallback) return primary;
  return {
    address:   primary.address   ?? fallback.address   ?? null,
    address_2: primary.address_2 ?? fallback.address_2 ?? null,
    city:      primary.city      ?? fallback.city      ?? null,
    state:     primary.state     ?? fallback.state     ?? null,
    zip:       primary.zip       ?? fallback.zip       ?? null,
  };
}

function advertiserToSource(adv: AdvertiserSyncRow): MailingSourceRow | null {
  const { first_name, last_name } = deriveFirstLast(adv);
  const email = (adv.contact_email ?? adv.portal_email ?? '').trim() || null;
  if (!first_name && !email) return null;
  return {
    first_name: first_name || (email ?? ''),
    last_name,
    email,
    phone:          adv.phone        ?? adv.office_phone ?? null,
    company:        adv.company      ?? null,
    title:          adv.title        ?? null,
    license_number: adv.license_number ?? null,
    address:        adv.address      ?? null,
    address_2:      adv.address_2    ?? null,
    city:           adv.city         ?? null,
    state:          adv.state        ?? null,
    zip:            adv.zip          ?? null,
    website:        adv.website      ?? null,
  };
}

function additionalToSource(ac: AdditionalContact, parent: { company: string | null }): MailingSourceRow | null {
  const first = (ac.first_name ?? '').trim();
  const email = (ac.email ?? '').trim();
  if (!first && !email) return null;
  return {
    first_name:     first || email,
    last_name:      ac.last_name || null,
    email:          email || null,
    phone:          ac.phone || null,
    company:        parent.company,
    title:          ac.title || null,
    license_number: null,
    address:        ac.address   || null,
    address_2:      ac.address_2 || null,
    city:           ac.city      || null,
    state:          ac.state     || null,
    zip:            ac.zip       || null,
    website:        null,
  };
}

/** Find an existing Advertisers-segment row matching this source. */
async function findAdvertiserMailingId(sql: Sql, src: MailingSourceRow): Promise<string | null> {
  // The legacy 'manual-newsline' bucket was merged into 'newsline-sa-print'
  // on 2026-06-21. Match in either segment so re-runs after the merge
  // still dedupe against pre-merge rows.
  const email = (src.email ?? '').trim().toLowerCase();
  if (email) {
    const rows = (await sql`
      SELECT id FROM mailing_contacts
       WHERE segment IN ('newsline-sa-print','manual-newsline')
         AND LOWER(COALESCE(email, '')) = ${email}
       LIMIT 1
    `) as unknown as Array<{ id: string }>;
    if (rows[0]) return rows[0].id;
    return null;
  }
  const phoneDigits = digits(src.phone);
  if (!phoneDigits) return null;
  const first = (src.first_name ?? '').toLowerCase();
  const last  = (src.last_name  ?? '').toLowerCase();
  const rows = (await sql`
    SELECT id FROM mailing_contacts
     WHERE segment IN ('newsline-sa-print','manual-newsline')
       AND LOWER(COALESCE(first_name, '')) = ${first}
       AND LOWER(COALESCE(last_name, ''))  = ${last}
       AND REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g') = ${phoneDigits}
     LIMIT 1
  `) as unknown as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}


// Build the tags JSON for an insert based on the destination segment.
// Merged-print segments (realtyline-atx-print, newsline-sa-print) get an
// 'active-advertiser' tag so the combined list can filter by audience
// type. Other segments keep the existing tag shape.
function buildAdvertiserTagsJson(segment: MailingSegment, opts: { staff?: boolean } = {}): string {
  const tags: string[] = ['advertiser'];
  if (opts.staff) tags.push('staff');
  if (segment === 'realtyline-atx-print' || segment === 'newsline-sa-print') {
    tags.push('active-advertiser');
  }
  return JSON.stringify(tags);
}

async function insertAdvertiserMailing(
  sql: Sql,
  src: MailingSourceRow,
  advertiser_id: number | null,
  source_tag: string,
): Promise<void> {
  // Legacy sync path now writes into the merged 'newsline-sa-print'
  // segment with the active-advertiser tag, mirroring the SA-side merge.
  await sql`
    INSERT INTO mailing_contacts
      (segment, first_name, last_name, email, phone, company, title, license_number,
       address, address_2, city, state, zip, website, source, advertiser_id, tags)
    VALUES
      ('newsline-sa-print',
       ${src.first_name || (src.email ?? '(no name)')},
       ${src.last_name},
       ${src.email},
       ${src.phone},
       ${src.company},
       ${src.title},
       ${src.license_number},
       ${src.address},
       ${src.address_2},
       ${src.city},
       ${src.state},
       ${src.zip},
       ${src.website},
       ${source_tag},
       ${advertiser_id},
       ${buildAdvertiserTagsJson('newsline-sa-print')}::jsonb)
  `;
}

/**
 * Walk active advertisers and insert any missing Advertisers-segment
 * mailing rows. Add-only: never updates an existing row (so manual
 * mailing-list edits are preserved). Returns counts for logging.
 */
export async function syncAdvertisersFromAdvertisers(): Promise<{
  added: number;
  skipped: number;
  errors: number;
}> {
  const sql = getSql();
  const advertisers = (await sql`
    SELECT id, first_name, last_name, name, contact_email, portal_email,
           phone, office_phone, company, title, license_number,
           address, address_2, city, state, zip, website,
           additional_contacts
      FROM advertisers
     WHERE COALESCE(status, 'prospect') = 'advertiser'
  `) as unknown as AdvertiserSyncRow[];

  let added = 0;
  let skipped = 0;
  let errors = 0;

  for (const adv of advertisers) {
    const primaryBase = advertiserToSource(adv);
    if (primaryBase) {
      try {
        const fallback = await loadLocationAddressForAdvertiser(adv.id);
        const merged = mergeAddresses(primaryBase, fallback);
        const primary = { ...primaryBase, ...merged };
        const existingId = await findAdvertiserMailingId(sql, primary);
        if (existingId) {
          skipped += 1;
        } else {
          await insertAdvertiserMailing(sql, primary, adv.id, 'sync:advertisers');
          added += 1;
        }
      } catch (err) {
        errors += 1;
        console.error('[mailing sync] primary failed for advertiser', adv.id, err);
      }
    }

    const acs: AdditionalContact[] = Array.isArray(adv.additional_contacts)
      ? (adv.additional_contacts as AdditionalContact[])
      : [];
    for (const ac of acs) {
      const src = additionalToSource(ac, { company: adv.company });
      if (!src) continue;
      try {
        const existingId = await findAdvertiserMailingId(sql, src);
        if (existingId) {
          skipped += 1;
        } else {
          await insertAdvertiserMailing(sql, src, adv.id, 'sync:advertisers:additional');
          added += 1;
        }
      } catch (err) {
        errors += 1;
        console.error('[mailing sync] additional failed for advertiser', adv.id, err);
      }
    }
  }

  // Sweep email-only routing across mailing-stage rows so any rows this
  // sync just inserted without an address land in the right segment.
  await sweepEmailOnlyRouting();

  return { added, skipped, errors };
}

/**
 * Upsert one advertiser's primary mailing row into the per-publication
 * Active Advertisers segment(s). Used as an inline hook from the
 * advertiser create/update endpoint so edits on a single advertiser
 * flow into the mailing list immediately.
 *
 * Routing by advertisers.publication:
 *   'austin'      -> active-advertiser-atx
 *   'san_antonio' -> active-advertiser-sa
 *   'both' (or unknown) -> BOTH segments
 *
 * Status gate: only syncs when advertiser status is 'advertiser'.
 * Per-segment dedupe by lowercased email; existing rows are updated in place.
 */
export async function upsertAdvertiserMailingByAdvertiserId(advertiserId: number): Promise<{ added: number; updated: number }> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, first_name, last_name, name, contact_email, portal_email,
           phone, office_phone, company, title, license_number,
           address, address_2, city, state, zip, website,
           additional_contacts,
           COALESCE(status, 'prospect') AS status,
           COALESCE(publication, 'austin') AS publication
      FROM advertisers
     WHERE id = ${advertiserId}
     LIMIT 1
  `) as unknown as Array<AdvertiserSyncRow & { status: string; publication: string }>;
  if (rows.length === 0) return { added: 0, updated: 0 };
  const adv = rows[0];

  if (adv.status !== 'advertiser') return { added: 0, updated: 0 };
  const primaryBase = advertiserToSource(adv);
  if (!primaryBase || !primaryBase.email) return { added: 0, updated: 0 };

  // Backfill missing address parts from the advertiser's primary location
  // (USPS verification needs a full street/city/state/zip).
  const fallback = await loadLocationAddressForAdvertiser(adv.id);
  const merged = mergeAddresses(primaryBase, fallback);
  // Re-attach the verified-non-null email so downstream narrowing survives the
  // object spread (primaryBase.email is narrowed to string above; the spread
  // would otherwise widen it back to string | null).
  const primary = { ...primaryBase, ...merged, email: primaryBase.email };

  const targets: MailingSegment[] = segmentsForPublication(adv.publication);

  const findInSeg = async (seg: MailingSegment, email: string): Promise<string | null> => {
    const e = email.trim().toLowerCase();
    if (!e) return null;
    const rows = (await sql`
      SELECT id FROM mailing_contacts
       WHERE segment = ${seg}
         AND LOWER(COALESCE(email, '')) = ${e}
       LIMIT 1
    `) as unknown as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  };

  let added = 0;
  let updated = 0;
  for (const seg of targets) {
    const existingId = await findInSeg(seg, primary.email);
    if (existingId) {
      await sql`
        UPDATE mailing_contacts
           SET first_name     = ${primary.first_name || (primary.email ?? '(no name)')},
               last_name      = ${primary.last_name},
               email          = ${primary.email},
               phone          = ${primary.phone},
               company        = ${primary.company},
               title          = ${primary.title},
               license_number = ${primary.license_number},
               address        = ${primary.address},
               address_2      = ${primary.address_2},
               city           = ${primary.city},
               state          = ${primary.state},
               zip            = ${primary.zip},
               website        = ${primary.website},
               advertiser_id  = ${adv.id}
         WHERE id = ${existingId}
      `;
      updated += 1;
    } else {
      await sql`
        INSERT INTO mailing_contacts
          (segment, first_name, last_name, email, phone, company, title, license_number,
           address, address_2, city, state, zip, website, source, advertiser_id, tags)
        VALUES
          (${seg},
           ${primary.first_name || (primary.email ?? '(no name)')},
           ${primary.last_name},
           ${primary.email},
           ${primary.phone},
           ${primary.company},
           ${primary.title},
           ${primary.license_number},
           ${primary.address},
           ${primary.address_2},
           ${primary.city},
           ${primary.state},
           ${primary.zip},
           ${primary.website},
           'hook:advertiser-upsert',
           ${adv.id},
           ${buildAdvertiserTagsJson(seg)}::jsonb)
      `;
      added += 1;
    }
  }
  // Route the rows we just touched in case they came back with an email
  // but no address.
  await sweepEmailOnlyRouting();
  return { added, updated };
}

/**
 * Walk every row in the given Active Advertisers segment and re-pull the
 * mailing address from the linked advertiser's primary location (or, for
 * staff rows, the staff member's assigned location). Used for USPS
 * verification: existing mailing rows from older backfills are missing
 * address parts because the advertisers row's own address columns are
 * usually blank.
 *
 * If \`force\` is false (default), only rows whose address OR city OR zip
 * is blank get updated — manual edits are preserved.
 * If \`force\` is true, every row in the segment is overwritten with the
 * advertiser/location address.
 */
export async function refreshMailingAddressesForSegment(
  segment: MailingSegment,
  opts: { force?: boolean } = {},
): Promise<{ scanned: number; updated: number; skippedNoAdvertiser: number; skippedComplete: number }> {
  const sql = getSql();
  const force = opts.force === true;

  const rows = (await sql`
    SELECT mc.id, mc.advertiser_id,
           mc.address, mc.address_2, mc.city, mc.state, mc.zip,
           mc.email,
           mc.tags @> '["staff"]'::jsonb AS is_staff
      FROM mailing_contacts mc
     WHERE mc.segment = ${segment}
  `) as unknown as Array<{
    id: string;
    advertiser_id: number | null;
    address: string | null;
    address_2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    email: string | null;
    is_staff: boolean;
  }>;

  let updated = 0;
  let skippedNoAdvertiser = 0;
  let skippedComplete = 0;

  // Prefetch advertisers + staff once for the segment so the per-contact loop
  // doesn't issue two extra round-trips per row (used to be the dominant cost
  // for large segments).
  const advertiserIds = Array.from(
    new Set(rows.map((r) => r.advertiser_id).filter((v): v is number => v != null)),
  );
  const advertiserPartsById = new Map<number, LocationAddressParts>();
  if (advertiserIds.length > 0) {
    const advRows = (await sql`
      SELECT id, address, address_2, city, state, zip
        FROM advertisers
       WHERE id = ANY(${advertiserIds}::int[])
    `) as unknown as Array<LocationAddressParts & { id: number }>;
    for (const r of advRows) {
      const { id: _id, ...parts } = r;
      advertiserPartsById.set(r.id, parts);
    }
  }

  // Build a staff lookup keyed by (advertiser_id, lowercased email) for the
  // staff-row branch below.
  const staffEmails = rows
    .filter((r) => r.is_staff && r.email && r.advertiser_id != null)
    .map((r) => r.email!.toLowerCase());
  const staffIdByKey = new Map<string, string>();
  if (staffEmails.length > 0 && advertiserIds.length > 0) {
    const staffRows = (await sql`
      SELECT id, advertiser_id, LOWER(COALESCE(email, '')) AS lemail
        FROM advertiser_staff
       WHERE advertiser_id = ANY(${advertiserIds}::int[])
         AND LOWER(COALESCE(email, '')) = ANY(${staffEmails})
    `) as unknown as Array<{ id: string; advertiser_id: number; lemail: string }>;
    for (const s of staffRows) {
      staffIdByKey.set(`${s.advertiser_id}::${s.lemail}`, s.id);
    }
  }

  for (const row of rows) {
    if (!row.advertiser_id) {
      skippedNoAdvertiser += 1;
      continue;
    }
    const hasFullAddress = !!(row.address && row.city && row.zip);
    if (!force && hasFullAddress) {
      skippedComplete += 1;
      continue;
    }

    // For staff rows, resolve the staff_id (was a per-row SQL call; now a
    // map lookup against the prefetched set above).
    let staffId: string | null = null;
    if (row.is_staff && row.email) {
      staffId = staffIdByKey.get(`${row.advertiser_id}::${row.email.toLowerCase()}`) ?? null;
    }

    const advParts: LocationAddressParts = advertiserPartsById.get(row.advertiser_id) ?? {
      address: null, address_2: null, city: null, state: null, zip: null,
    };
    const locFallback = await loadLocationAddressForAdvertiser(
      row.advertiser_id,
      { staffId },
    );
    const merged = mergeAddresses(advParts, locFallback);

    if (!merged.address && !merged.city && !merged.zip) {
      // Nothing to write — advertiser has no address anywhere.
      skippedComplete += 1;
      continue;
    }

    if (force) {
      await sql`
        UPDATE mailing_contacts
           SET address   = ${merged.address},
               address_2 = ${merged.address_2},
               city      = ${merged.city},
               state     = ${merged.state},
               zip       = ${merged.zip}
         WHERE id = ${row.id}
      `;
    } else {
      // Only fill blanks — don't overwrite admin edits.
      await sql`
        UPDATE mailing_contacts
           SET address   = COALESCE(NULLIF(address, ''),   ${merged.address}),
               address_2 = COALESCE(NULLIF(address_2, ''), ${merged.address_2}),
               city      = COALESCE(NULLIF(city, ''),      ${merged.city}),
               state     = COALESCE(NULLIF(state, ''),     ${merged.state}),
               zip       = COALESCE(NULLIF(zip, ''),       ${merged.zip})
         WHERE id = ${row.id}
      `;
    }
    updated += 1;
  }

  // Filling in addresses can move rows OUT of email-only — sweep to
  // catch them.
  await sweepEmailOnlyRouting();
  return { scanned: rows.length, updated, skippedNoAdvertiser, skippedComplete };
}

/**
 * One-time backfill: copy every currently-active advertiser plus their
 * staff into the per-publication active-advertiser-atx / -sa segments.
 *
 * Routing is driven by advertisers.publication:
 *   'austin'      -> active-advertiser-atx
 *   'san_antonio' -> active-advertiser-sa
 *   'both' (or null/unknown) -> BOTH segments
 *
 * Idempotent: dedup is per-segment by lowercased email. Safe to re-run.
 */
export async function backfillActiveAdvertisersSegment(): Promise<{
  advertisersAdded: number;
  staffAdded: number;
  skipped: number;
  errors: number;
}> {
  const sql = getSql();
  let advertisersAdded = 0;
  let staffAdded = 0;
  let skipped = 0;
  let errors = 0;

  const advertisers = (await sql`
    SELECT id, first_name, last_name, name, contact_email, portal_email,
           phone, office_phone, company, title, license_number,
           address, address_2, city, state, zip, website,
           COALESCE(publication, 'austin') AS publication
      FROM advertisers
     WHERE COALESCE(status, 'prospect') = 'advertiser'
  `) as unknown as Array<AdvertiserSyncRow & { publication: string }>;

  const findInSegment = async (
    seg: MailingSegment,
    email: string | null,
  ): Promise<string | null> => {
    if (!email) return null;
    const e = email.trim().toLowerCase();
    if (!e) return null;
    const rows = (await sql`
      SELECT id FROM mailing_contacts
       WHERE segment = ${seg}
         AND LOWER(COALESCE(email, '')) = ${e}
       LIMIT 1
    `) as unknown as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  };

  const targetSegmentsFor = (publication: string): MailingSegment[] =>
    segmentsForPublication(publication);

  for (const adv of advertisers) {
    const segments = targetSegmentsFor(adv.publication);
    const primaryBase = advertiserToSource(adv);

    // Pre-load the location fallback once per advertiser (used for both
    // primary and staff rows).
    const advFallback = await loadLocationAddressForAdvertiser(adv.id);

    const primary = primaryBase
      ? { ...primaryBase, ...mergeAddresses(primaryBase, advFallback) }
      : null;

    // Primary contact for this advertiser, into each target segment.
    if (primary && primary.email) {
      for (const seg of segments) {
        try {
          const existing = await findInSegment(seg, primary.email);
          if (existing) {
            skipped += 1;
            continue;
          }
          await sql`
            INSERT INTO mailing_contacts
              (segment, first_name, last_name, email, phone, company, title, license_number,
               address, address_2, city, state, zip, website, source, advertiser_id, tags)
            VALUES
              (${seg},
               ${primary.first_name || (primary.email ?? '(no name)')},
               ${primary.last_name},
               ${primary.email},
               ${primary.phone},
               ${primary.company},
               ${primary.title},
               ${primary.license_number},
               ${primary.address},
               ${primary.address_2},
               ${primary.city},
               ${primary.state},
               ${primary.zip},
               ${primary.website},
               'backfill:active-advertiser',
               ${adv.id},
               ${buildAdvertiserTagsJson(seg)}::jsonb)
          `;
          advertisersAdded += 1;
        } catch (err) {
          errors += 1;
          console.error('[backfill active-advertiser] primary failed for advertiser', adv.id, seg, err);
        }
      }
    }

    // Staff for this advertiser, into each target segment.
    const staffRows = (await sql`
      SELECT id, name, title, email, phone
        FROM advertiser_staff
       WHERE advertiser_id = ${adv.id}
    `) as unknown as Array<{
      id: string;
      name: string | null;
      title: string | null;
      email: string | null;
      phone: string | null;
    }>;

    for (const s of staffRows) {
      const email = (s.email ?? '').trim();
      if (!email) continue;
      const { first_name, last_name } = splitFullName(s.name ?? '');
      // Prefer this staff member's assigned-location address, falling back
      // to the advertiser's primary location.
      const staffFallback =
        (await loadLocationAddressForAdvertiser(adv.id, { staffId: s.id })) ??
        advFallback;
      const staffMerged = mergeAddresses(
        {
          address: adv.address ?? null,
          address_2: adv.address_2 ?? null,
          city: adv.city ?? null,
          state: adv.state ?? null,
          zip: adv.zip ?? null,
        },
        staffFallback,
      );
      for (const seg of segments) {
        try {
          const existing = await findInSegment(seg, email);
          if (existing) {
            skipped += 1;
            continue;
          }
          await sql`
            INSERT INTO mailing_contacts
              (segment, first_name, last_name, email, phone, company, title, license_number,
               address, address_2, city, state, zip, website, source, advertiser_id, tags)
            VALUES
              (${seg},
               ${first_name || email},
               ${last_name || null},
               ${email},
               ${s.phone ?? null},
               ${adv.company ?? null},
               ${s.title ?? null},
               ${null},
               ${staffMerged.address},
               ${staffMerged.address_2},
               ${staffMerged.city},
               ${staffMerged.state},
               ${staffMerged.zip},
               ${adv.website ?? null},
               'backfill:active-advertiser:staff',
               ${adv.id},
               ${buildAdvertiserTagsJson(seg, { staff: true })}::jsonb)
          `;
          staffAdded += 1;
        } catch (err) {
          errors += 1;
          console.error('[backfill active-advertiser] staff failed', s.id, seg, err);
        }
      }
    }
  }

  await sweepEmailOnlyRouting();
  return { advertisersAdded, staffAdded, skipped, errors };
}

/**
 * Upsert one advertiser_staff row into the per-publication Active
 * Advertisers segment(s).
 * - Only syncs when the parent advertiser status is 'advertiser' AND staff.email is set.
 * - Routes by parent advertiser publication (san_antonio -> -sa, austin -> -atx,
 *   both -> BOTH).
 * - Per-segment dedup by lowercased email; existing rows are updated in place
 *   and tagged with ["advertiser","staff"].
 * - Best-effort: returns counts, never throws unhandled.
 */
export async function upsertStaffMailingByStaffId(
  staffId: string,
): Promise<{ added: number; updated: number; skipped: boolean }> {
  const sql = getSql();
  const rows = (await sql`
    SELECT s.id, s.advertiser_id, s.name, s.title, s.email, s.phone,
           a.company, COALESCE(a.status, 'prospect') AS status,
           COALESCE(a.publication, 'austin') AS publication,
           a.address, a.address_2, a.city, a.state, a.zip, a.website
      FROM advertiser_staff s
      JOIN advertisers a ON a.id = s.advertiser_id
     WHERE s.id = ${staffId}
     LIMIT 1
  `) as unknown as Array<{
    id: string;
    advertiser_id: number;
    name: string | null;
    title: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
    status: string;
    publication: string;
    address: string | null;
    address_2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    website: string | null;
  }>;
  if (rows.length === 0) return { added: 0, updated: 0, skipped: true };
  const staff = rows[0];

  if (staff.status !== 'advertiser') return { added: 0, updated: 0, skipped: true };
  const email = (staff.email ?? '').trim();
  if (!email) return { added: 0, updated: 0, skipped: true };

  // Backfill staff's mailing address from their assigned location (or the
  // advertiser's primary location) when the advertisers row itself has
  // blank address fields. Required for USPS verification.
  const fallback = await loadLocationAddressForAdvertiser(staff.advertiser_id, {
    staffId: staff.id,
  });
  const merged = mergeAddresses(
    {
      address: staff.address ?? null,
      address_2: staff.address_2 ?? null,
      city: staff.city ?? null,
      state: staff.state ?? null,
      zip: staff.zip ?? null,
    },
    fallback,
  );

  const { first_name, last_name } = splitFullName(staff.name ?? '');

  const targets: MailingSegment[] = segmentsForPublication(staff.publication);

  const findInSeg = async (seg: MailingSegment): Promise<string | null> => {
    const e = email.toLowerCase();
    const rows = (await sql`
      SELECT id FROM mailing_contacts
       WHERE segment = ${seg}
         AND LOWER(COALESCE(email, '')) = ${e}
       LIMIT 1
    `) as unknown as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  };

  let added = 0;
  let updated = 0;
  for (const seg of targets) {
    const existingId = await findInSeg(seg);
    if (existingId) {
      await sql`
        UPDATE mailing_contacts
           SET first_name     = ${first_name || email},
               last_name      = ${last_name || null},
               email          = ${email},
               phone          = ${staff.phone ?? null},
               company        = ${staff.company ?? null},
               title          = ${staff.title ?? null},
               address        = ${merged.address},
               address_2      = ${merged.address_2},
               city           = ${merged.city},
               state          = ${merged.state},
               zip            = ${merged.zip},
               website        = ${staff.website ?? null},
               advertiser_id  = ${staff.advertiser_id},
               tags           = COALESCE((
                 SELECT jsonb_agg(DISTINCT t)
                   FROM jsonb_array_elements_text(
                     COALESCE(tags, '[]'::jsonb) || ${buildAdvertiserTagsJson(seg, { staff: true })}::jsonb
                   ) AS t
               ), '[]'::jsonb)
         WHERE id = ${existingId}
      `;
      updated += 1;
    } else {
      await sql`
        INSERT INTO mailing_contacts
          (segment, first_name, last_name, email, phone, company, title, license_number,
           address, address_2, city, state, zip, website, source, advertiser_id, tags)
        VALUES
          (${seg},
           ${first_name || email},
           ${last_name || null},
           ${email},
           ${staff.phone ?? null},
           ${staff.company ?? null},
           ${staff.title ?? null},
           ${null},
           ${merged.address},
           ${merged.address_2},
           ${merged.city},
           ${merged.state},
           ${merged.zip},
           ${staff.website ?? null},
           'hook:staff-upsert',
           ${staff.advertiser_id},
           ${buildAdvertiserTagsJson(seg, { staff: true })}::jsonb)
      `;
      added += 1;
    }
  }
  await sweepEmailOnlyRouting();
  return { added, updated, skipped: false };
}

// ============================================================
// Refresh addresses for holding-stage rows (SABOR / UnlockMLS).
//
// Holding rows come from external feeds (RAMCO/SABOR or UnlockMLS) and
// typically do NOT have advertiser_id set. We match each holding row to an
// advertiser by:
//   1. license_number  ↔ advertisers.license_number
//   2. email           ↔ advertiser_staff.email   (then staff.advertiser_id)
//
// For each matched row, fill in blank address fields from the advertiser
// (preferring the staff-assigned location for email matches). Admin edits
// are preserved — only NULL/empty cells get written.
// ============================================================

export async function refreshHoldingAddressesFromAdvertisers(
  externalSource: string,
): Promise<{
  scanned: number;
  updated: number;
  skippedNoMatch: number;
  skippedComplete: number;
}> {
  const sql = getSql();

  const rows = (await sql`
    SELECT id, license_number, email,
           address, address_2, city, state, zip
      FROM mailing_contacts
     WHERE stage = 'holding'
       AND external_source = ${externalSource}
  `) as unknown as Array<{
    id: string;
    license_number: string | null;
    email: string | null;
    address: string | null;
    address_2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  }>;

  let updated = 0;
  let skippedNoMatch = 0;
  let skippedComplete = 0;

  // Skip rows that already have a complete address (preserve admin edits).
  const candidates = rows.filter((r) => !(r.address && r.city && r.zip));
  skippedComplete += rows.length - candidates.length;
  if (candidates.length === 0) {
    return { scanned: rows.length, updated, skippedNoMatch, skippedComplete };
  }

  // Prefetch advertiser matches by license_number (lowercased).
  const licenses = Array.from(
    new Set(
      candidates
        .map((r) => r.license_number?.trim().toLowerCase())
        .filter((v): v is string => !!v),
    ),
  );
  const advByLicense = new Map<string, { id: number; parts: LocationAddressParts }>();
  if (licenses.length > 0) {
    const advRows = (await sql`
      SELECT id, LOWER(TRIM(license_number)) AS llicense,
             address, address_2, city, state, zip
        FROM advertisers
       WHERE LOWER(TRIM(license_number)) = ANY(${licenses})
    `) as unknown as Array<{
      id: number;
      llicense: string;
      address: string | null;
      address_2: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
    }>;
    for (const r of advRows) {
      advByLicense.set(r.llicense, {
        id: r.id,
        parts: {
          address: r.address,
          address_2: r.address_2,
          city: r.city,
          state: r.state,
          zip: r.zip,
        },
      });
    }
  }

  // Prefetch staff matches by email (lowercased).
  const emails = Array.from(
    new Set(
      candidates
        .map((r) => r.email?.trim().toLowerCase())
        .filter((v): v is string => !!v),
    ),
  );
  const staffByEmail = new Map<string, { staffId: string; advertiserId: number }>();
  if (emails.length > 0) {
    const staffRows = (await sql`
      SELECT id, advertiser_id, LOWER(TRIM(email)) AS lemail
        FROM advertiser_staff
       WHERE LOWER(TRIM(email)) = ANY(${emails})
         AND advertiser_id IS NOT NULL
    `) as unknown as Array<{ id: string; advertiser_id: number; lemail: string }>;
    for (const s of staffRows) {
      // First match wins (rare duplicates).
      if (!staffByEmail.has(s.lemail)) {
        staffByEmail.set(s.lemail, { staffId: s.id, advertiserId: s.advertiser_id });
      }
    }
  }

  // Cache per-advertiser address parts so we don't re-fetch.
  const advPartsById = new Map<number, LocationAddressParts>();
  for (const v of advByLicense.values()) advPartsById.set(v.id, v.parts);

  // For staff-matched advertisers we may not have prefetched their parts —
  // load any missing ones now in one round-trip.
  const missingAdvIds = Array.from(
    new Set(
      Array.from(staffByEmail.values())
        .map((s) => s.advertiserId)
        .filter((id) => !advPartsById.has(id)),
    ),
  );
  if (missingAdvIds.length > 0) {
    const advRows = (await sql`
      SELECT id, address, address_2, city, state, zip
        FROM advertisers
       WHERE id = ANY(${missingAdvIds}::int[])
    `) as unknown as Array<LocationAddressParts & { id: number }>;
    for (const r of advRows) {
      const { id: _id, ...parts } = r;
      advPartsById.set(r.id, parts);
    }
  }

  for (const row of candidates) {
    // Resolve advertiser + (optional) staffId for this holding row.
    let advertiserId: number | null = null;
    let staffId: string | null = null;

    const lic = row.license_number?.trim().toLowerCase();
    if (lic && advByLicense.has(lic)) {
      advertiserId = advByLicense.get(lic)!.id;
    }
    if (!advertiserId) {
      const em = row.email?.trim().toLowerCase();
      if (em && staffByEmail.has(em)) {
        const s = staffByEmail.get(em)!;
        advertiserId = s.advertiserId;
        staffId = s.staffId;
      }
    }

    if (!advertiserId) {
      skippedNoMatch += 1;
      continue;
    }

    const advParts: LocationAddressParts = advPartsById.get(advertiserId) ?? {
      address: null, address_2: null, city: null, state: null, zip: null,
    };
    const locFallback = await loadLocationAddressForAdvertiser(advertiserId, { staffId });
    const merged = mergeAddresses(advParts, locFallback);

    if (!merged.address && !merged.city && !merged.zip) {
      // Advertiser exists but has no address anywhere — nothing to write.
      skippedNoMatch += 1;
      continue;
    }

    // Fill blanks only — preserve admin edits.
    await sql`
      UPDATE mailing_contacts
         SET address   = COALESCE(NULLIF(address,   ''), ${merged.address}),
             address_2 = COALESCE(NULLIF(address_2, ''), ${merged.address_2}),
             city      = COALESCE(NULLIF(city,      ''), ${merged.city}),
             state     = COALESCE(NULLIF(state,     ''), ${merged.state}),
             zip       = COALESCE(NULLIF(zip,       ''), ${merged.zip})
       WHERE id = ${row.id}
    `;
    updated += 1;
  }

  return {
    scanned: rows.length,
    updated,
    skippedNoMatch,
    skippedComplete,
  };
}

// ============================================================
// Delete + dedupe helpers for holding-stage rows (by external_source).
// ============================================================

export async function deleteAllHoldingForSource(externalSource: string): Promise<number> {
  const sql = getSql();
  const rows = (await sql`
    DELETE FROM mailing_contacts
     WHERE stage = 'holding'
       AND external_source = ${externalSource}
     RETURNING id
  `) as unknown as Array<{ id: string }>;
  return rows.length;
}

export async function dedupeHoldingForSource(
  externalSource: string,
): Promise<{ removed: number }> {
  const sql = getSql();
  const result = (await sql`
    WITH groups AS (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY
                 CASE
                   WHEN COALESCE(email, '') <> '' THEN 'e:' || LOWER(email)
                   WHEN COALESCE(license_number, '') <> '' THEN 'l:' || LOWER(license_number)
                   ELSE 'n:' ||
                        LOWER(COALESCE(first_name, '')) || '|' ||
                        LOWER(COALESCE(last_name, ''))  || '|' ||
                        REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g')
                 END
               ORDER BY created_at ASC, id ASC
             ) AS rn
        FROM mailing_contacts
       WHERE stage = 'holding'
         AND external_source = ${externalSource}
    )
    DELETE FROM mailing_contacts
     WHERE id IN (SELECT id FROM groups WHERE rn > 1)
     RETURNING id
  `) as unknown as Array<{ id: string }>;
  return { removed: result.length };
}
