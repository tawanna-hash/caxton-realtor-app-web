// lib/server/mailing/mutations.ts
//
// Create / update / delete + dedupe for mailing_contacts.

import { getSql } from '@/lib/db';
import { isMailingSegment, type MailingSegment } from './segments';
import type { MailingContactRow, MailingContactInput } from './types';
import { normString } from './_internal';
import { classifyTargetSegment } from './email-only-routing';

// Auto-route the row to the email-only segment for its market if it has
// an email but no address (or back out of email-only when an address is
// added). Idempotent — no-ops when the current segment is already the
// right one. Only runs against rows in the 'mailing' stage; holding rows
// are routed separately by the external-upsert path.
async function reclassifySegment(id: string): Promise<void> {
  const sql = getSql();
  const rows = (await sql`
    SELECT segment, stage, email, address, city, state, zip
      FROM mailing_contacts WHERE id = ${id}
  `) as unknown as Array<{
    segment: string;
    stage: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  }>;
  const r = rows[0];
  if (!r) return;
  if (r.stage && r.stage !== 'mailing') return;
  if (!isMailingSegment(r.segment)) return;
  const target = classifyTargetSegment({
    current_segment: r.segment,
    email: r.email,
    address: r.address,
    city: r.city,
    state: r.state,
    zip: r.zip,
  });
  if (target !== r.segment) {
    await sql`UPDATE mailing_contacts SET segment = ${target} WHERE id = ${id}`;
  }
}

// ============================================================

export async function createMailingContact(input: MailingContactInput): Promise<MailingContactRow> {
  const sql = getSql();
  const segment = isMailingSegment(input.segment) ? input.segment : 'realtyline-atx-print';
  const first_name = normString(input.first_name) ?? normString(input.email) ?? '(no name)';
  const tags = Array.isArray(input.tags) ? JSON.stringify(input.tags) : '[]';

  const rows = (await sql`
    INSERT INTO mailing_contacts
      (segment, first_name, last_name, email, phone, company, title, license_number,
       address, address_2, city, state, zip, website, notes, source, advertiser_id, tags)
    VALUES
      (${segment},
       ${first_name},
       ${normString(input.last_name)},
       ${normString(input.email)},
       ${normString(input.phone)},
       ${normString(input.company)},
       ${normString(input.title)},
       ${normString(input.license_number)},
       ${normString(input.address)},
       ${normString(input.address_2)},
       ${normString(input.city)},
       ${normString(input.state)},
       ${normString(input.zip)},
       ${normString(input.website)},
       ${normString(input.notes)},
       ${normString(input.source)},
       ${typeof input.advertiser_id === 'number' && Number.isFinite(input.advertiser_id) ? input.advertiser_id : null},
       ${tags}::jsonb)
    RETURNING *
  `) as unknown as MailingContactRow[];
  const created = rows[0];
  // Auto-route to email-only segment if the new row has email but no address.
  await reclassifySegment(created.id);
  const after = (await sql`SELECT * FROM mailing_contacts WHERE id = ${created.id}`) as unknown as MailingContactRow[];
  return after[0] ?? created;
}

const PATCHABLE_FIELDS: (keyof MailingContactInput)[] = [
  'segment', 'first_name', 'last_name', 'email', 'phone', 'company', 'title', 'license_number',
  'address', 'address_2', 'city', 'state', 'zip', 'website', 'notes', 'source', 'advertiser_id', 'tags',
];

export async function updateMailingContact(id: string, input: MailingContactInput): Promise<MailingContactRow | null> {
  const sql = getSql();

  const existingRows = (
    await sql`SELECT * FROM mailing_contacts WHERE id = ${id}`
  ) as unknown as MailingContactRow[];
  const existing = existingRows[0];
  if (!existing) return null;

  const addressFields = ['address', 'address_2', 'city', 'state', 'zip'] as const;
  const addressChanged = addressFields.some((field) => {
    if (!(field in input)) return false;

    const incoming = input[field];
    const nextValue = incoming === null ? null : normString(incoming);
    return nextValue !== existing[field];
  });

  for (const field of PATCHABLE_FIELDS) {
    if (!(field in input)) continue;

    const raw = input[field];

    if (field === 'segment') {
      if (isMailingSegment(raw)) {
        await sql`UPDATE mailing_contacts SET segment = ${raw} WHERE id = ${id}`;
      }
      continue;
    }

    if (field === 'tags') {
      if (Array.isArray(raw)) {
        await sql`UPDATE mailing_contacts SET tags = ${JSON.stringify(raw)}::jsonb WHERE id = ${id}`;
      }
      continue;
    }

    if (field === 'advertiser_id') {
      const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
      await sql`UPDATE mailing_contacts SET advertiser_id = ${value} WHERE id = ${id}`;
      continue;
    }

    if (field === 'first_name') {
      const value = normString(raw);
      if (value) {
        await sql`UPDATE mailing_contacts SET first_name = ${value} WHERE id = ${id}`;
      }
      continue;
    }

    const value = raw === null ? null : normString(raw);

    switch (field) {
      case 'last_name':
        await sql`UPDATE mailing_contacts SET last_name = ${value} WHERE id = ${id}`;
        break;
      case 'email':
        await sql`UPDATE mailing_contacts SET email = ${value} WHERE id = ${id}`;
        break;
      case 'phone':
        await sql`UPDATE mailing_contacts SET phone = ${value} WHERE id = ${id}`;
        break;
      case 'company':
        await sql`UPDATE mailing_contacts SET company = ${value} WHERE id = ${id}`;
        break;
      case 'title':
        await sql`UPDATE mailing_contacts SET title = ${value} WHERE id = ${id}`;
        break;
      case 'license_number':
        await sql`UPDATE mailing_contacts SET license_number = ${value} WHERE id = ${id}`;
        break;
      case 'address':
        await sql`UPDATE mailing_contacts SET address = ${value} WHERE id = ${id}`;
        break;
      case 'address_2':
        await sql`UPDATE mailing_contacts SET address_2 = ${value} WHERE id = ${id}`;
        break;
      case 'city':
        await sql`UPDATE mailing_contacts SET city = ${value} WHERE id = ${id}`;
        break;
      case 'state':
        await sql`UPDATE mailing_contacts SET state = ${value} WHERE id = ${id}`;
        break;
      case 'zip':
        await sql`UPDATE mailing_contacts SET zip = ${value} WHERE id = ${id}`;
        break;
      case 'website':
        await sql`UPDATE mailing_contacts SET website = ${value} WHERE id = ${id}`;
        break;
      case 'notes':
        await sql`UPDATE mailing_contacts SET notes = ${value} WHERE id = ${id}`;
        break;
      case 'source':
        await sql`UPDATE mailing_contacts SET source = ${value} WHERE id = ${id}`;
        break;
    }
  }

  if (addressChanged) {
    await sql`
      UPDATE mailing_contacts
      SET
        addr_status = 'Pending',
        addr_verified_at = NULL,
        addr_usps_normalized = NULL,
        lat = NULL,
        lon = NULL,
        geocoded_at = NULL,
        distance_abor_mi = NULL,
        distance_fivepoints_mi = NULL,
        distance_sabor_mi = NULL,
        updated_at = NOW()
      WHERE id = ${id}
    `;
  }

  await reclassifySegment(id);

  const rows = (
    await sql`SELECT * FROM mailing_contacts WHERE id = ${id}`
  ) as unknown as MailingContactRow[];

  return rows[0] ?? null;
}

export async function deleteMailingContact(id: string): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`DELETE FROM mailing_contacts WHERE id = ${id} RETURNING id`) as unknown as Array<{ id: string }>;
  return rows.length > 0;
}

export async function deleteMailingContacts(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const sql = getSql();
  // Use ANY() with text[] cast back to uuid[] inside Postgres.
  const rows = (await sql`
    DELETE FROM mailing_contacts
     WHERE id = ANY(${ids}::uuid[])
     RETURNING id
  `) as unknown as Array<{ id: string }>;
  return rows.length;
}

/**
 * Delete every contact in a segment. Irreversible. Used by the
 * "Delete all in segment" admin action.
 */
export async function deleteAllInSegment(segment: MailingSegment): Promise<number> {
  const sql = getSql();
  const rows = (await sql`
    DELETE FROM mailing_contacts
     WHERE segment = ${segment}
     RETURNING id
  `) as unknown as Array<{ id: string }>;
  return rows.length;
}
// ============================================================
// Dedupe (keeps oldest row per duplicate group)
// ============================================================

export async function dedupeSegment(segment: MailingSegment): Promise<{ removed: number }> {
  const sql = getSql();
  // Match PressBook: same email (case-insensitive) OR same first+last+digits-of-phone.
  // Postgres-side: keep MIN(created_at) per group.
  const result = (await sql`
    WITH groups AS (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY
                 CASE
                   WHEN COALESCE(email, '') <> '' THEN 'e:' || LOWER(email)
                   ELSE 'n:' ||
                        LOWER(COALESCE(first_name, '')) || '|' ||
                        LOWER(COALESCE(last_name, ''))  || '|' ||
                        REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g')
                 END
               ORDER BY created_at ASC, id ASC
             ) AS rn
        FROM mailing_contacts
       WHERE segment = ${segment}
    )
    DELETE FROM mailing_contacts
     WHERE id IN (SELECT id FROM groups WHERE rn > 1)
     RETURNING id
  `) as unknown as Array<{ id: string }>;
  return { removed: result.length };
}

