// lib/server/mailing/external-upsert.ts
//
// Upsert contacts from external sources (UnlockMLS scraper, CSV imports,
// manual admin add) into the holding stage with smart-merge semantics.

import { getSql } from '@/lib/db';
import { isMailingSegment, type MailingSegment } from './segments';
import { normString } from './_internal';
import { suppressedSubset } from '@/lib/server/email-suppressions';

// ============================================================

// ============================================================

export interface ExternalContactInput {
  external_id: string;
  external_source: string;
  first_name: string;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile_phone?: string | null;
  company?: string | null;
  title?: string | null;
  license_number?: string | null;
  address?: string | null;
  address_2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  website?: string | null;
  segment?: MailingSegment;
  source?: string | null;
}

export interface UpsertHoldingResult {
  inserted: number;
  updated: number;
  unchanged: number;
  /** Inputs whose email is in the permanent suppression list and were skipped. */
  suppressed_skipped: number;
}

export async function upsertHoldingContacts(
  inputs: ExternalContactInput[],
): Promise<UpsertHoldingResult> {
  if (inputs.length === 0) return { inserted: 0, updated: 0, unchanged: 0, suppressed_skipped: 0 };
  const sql = getSql();
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let suppressed_skipped = 0;

  // Pre-load the suppression set for every email in this batch in one
  // query. This is what makes a Mailing-Hub delete permanent: even if
  // the upstream ABOR / SABOR scraper still sees the contact, we
  // refuse to re-insert it as a NEW holding row.
  //
  // Suppression keys on lower(email). We only skip the brand-new-insert
  // path — if the email already exists in mailing_contacts (e.g. it was
  // never deleted, only the scraper is re-syncing) we still merge
  // updates into the existing row. The smart-merge above won't reset
  // unsubscribed_at or override an admin's manual edits.
  const inputEmails = inputs
    .map((i) => (typeof i.email === 'string' ? i.email.trim().toLowerCase() : ''))
    .filter((e) => e.length > 0);
  const suppressed = await suppressedSubset(inputEmails);

  for (const inp of inputs) {
    const segment: MailingSegment = isMailingSegment(inp.segment) ? inp.segment : 'realtor';
    const first_name = normString(inp.first_name) ?? normString(inp.email) ?? '(no name)';

    // Look up by external_source+external_id first.
    let existing = (await sql`
      SELECT id, email, address, phone, mobile_phone, company, title, license_number,
             city, state, zip, website, address_2
        FROM mailing_contacts
       WHERE external_source = ${inp.external_source}
         AND external_id = ${inp.external_id}
       LIMIT 1
    `) as unknown as Array<{
      id: string;
      email: string | null;
      address: string | null;
      phone: string | null;
      mobile_phone: string | null;
      company: string | null;
      title: string | null;
      license_number: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
      website: string | null;
      address_2: string | null;
    }>;

    // Fallback: license number (case-insensitive)
    if (existing.length === 0 && inp.license_number) {
      existing = (await sql`
        SELECT id, email, address, phone, mobile_phone, company, title, license_number,
               city, state, zip, website, address_2
          FROM mailing_contacts
         WHERE LOWER(license_number) = LOWER(${inp.license_number})
         LIMIT 1
      `) as unknown as typeof existing;
    }

    // Fallback: email (case-insensitive)
    if (existing.length === 0 && inp.email) {
      existing = (await sql`
        SELECT id, email, address, phone, mobile_phone, company, title, license_number,
               city, state, zip, website, address_2
          FROM mailing_contacts
         WHERE LOWER(email) = LOWER(${inp.email})
         LIMIT 1
      `) as unknown as typeof existing;
    }

    // Suppression gate: if the email is on the permanent suppression
    // list AND the contact doesn't already exist in mailing_contacts,
    // skip this input entirely. (If it DOES already exist, the row was
    // likely re-created intentionally by an admin and we let the
    // smart-merge update flow through.)
    if (existing.length === 0 && inp.email) {
      const norm = inp.email.trim().toLowerCase();
      if (suppressed.has(norm)) {
        suppressed_skipped += 1;
        continue;
      }
    }

    if (existing.length > 0) {
      // Smart-merge: only fill blanks. Don't touch stage/segment so
      // promoted records stay promoted, manual edits stick.
      const cur = existing[0];
      const updates: { field: string; value: string | null }[] = [];
      const maybeSet = (field: string, currentVal: string | null, newVal: string | null | undefined) => {
        if (currentVal == null || currentVal === '') {
          const v = normString(newVal);
          if (v) updates.push({ field, value: v });
        }
      };
      maybeSet('email',          cur.email,          inp.email);
      maybeSet('phone',          cur.phone,          inp.phone);
      maybeSet('mobile_phone',   cur.mobile_phone,   inp.mobile_phone);
      maybeSet('company',        cur.company,        inp.company);
      maybeSet('title',          cur.title,          inp.title);
      maybeSet('license_number', cur.license_number, inp.license_number);
      maybeSet('address',        cur.address,        inp.address);
      maybeSet('address_2',      cur.address_2,      inp.address_2);
      maybeSet('city',           cur.city,           inp.city);
      maybeSet('state',          cur.state,          inp.state);
      maybeSet('zip',            cur.zip,            inp.zip);
      maybeSet('website',        cur.website,        inp.website);

      if (updates.length === 0) {
        unchanged += 1;
        continue;
      }
      // Apply one field at a time (Neon doesn't allow dynamic SET lists).
      for (const u of updates) {
        switch (u.field) {
          case 'email':          await sql`UPDATE mailing_contacts SET email          = ${u.value} WHERE id = ${cur.id}`; break;
          case 'phone':          await sql`UPDATE mailing_contacts SET phone          = ${u.value} WHERE id = ${cur.id}`; break;
          case 'mobile_phone':   await sql`UPDATE mailing_contacts SET mobile_phone   = ${u.value} WHERE id = ${cur.id}`; break;
          case 'company':        await sql`UPDATE mailing_contacts SET company        = ${u.value} WHERE id = ${cur.id}`; break;
          case 'title':          await sql`UPDATE mailing_contacts SET title          = ${u.value} WHERE id = ${cur.id}`; break;
          case 'license_number': await sql`UPDATE mailing_contacts SET license_number = ${u.value} WHERE id = ${cur.id}`; break;
          case 'address':        await sql`UPDATE mailing_contacts SET address        = ${u.value} WHERE id = ${cur.id}`; break;
          case 'address_2':      await sql`UPDATE mailing_contacts SET address_2      = ${u.value} WHERE id = ${cur.id}`; break;
          case 'city':           await sql`UPDATE mailing_contacts SET city           = ${u.value} WHERE id = ${cur.id}`; break;
          case 'state':          await sql`UPDATE mailing_contacts SET state          = ${u.value} WHERE id = ${cur.id}`; break;
          case 'zip':            await sql`UPDATE mailing_contacts SET zip            = ${u.value} WHERE id = ${cur.id}`; break;
          case 'website':        await sql`UPDATE mailing_contacts SET website        = ${u.value} WHERE id = ${cur.id}`; break;
        }
      }
      // Stamp external_id/source if previously null (e.g. license-matched
      // a manually-added row).
      await sql`
        UPDATE mailing_contacts
           SET external_id     = COALESCE(external_id, ${inp.external_id}),
               external_source = COALESCE(external_source, ${inp.external_source})
         WHERE id = ${cur.id}
      `;
      updated += 1;
    } else {
      // Insert new holding row. Pending statuses iff we have content
      // worth verifying; otherwise leave NULL so the UI shows blanks.
      const addrPending = inp.address ? 'Pending' : null;
      const emailPending = inp.email ? 'Pending' : null;
      await sql`
        INSERT INTO mailing_contacts
          (segment, stage, first_name, last_name, email, phone, mobile_phone, company, title,
           license_number, address, address_2, city, state, zip, website,
           source, external_id, external_source, addr_status, email_status, tags)
        VALUES
          (${segment}, 'holding',
           ${first_name},
           ${normString(inp.last_name)},
           ${normString(inp.email)},
           ${normString(inp.phone)},
           ${normString(inp.mobile_phone)},
           ${normString(inp.company)},
           ${normString(inp.title)},
           ${normString(inp.license_number)},
           ${normString(inp.address)},
           ${normString(inp.address_2)},
           ${normString(inp.city)},
           ${normString(inp.state)},
           ${normString(inp.zip)},
           ${normString(inp.website)},
           ${normString(inp.source) ?? inp.external_source},
           ${inp.external_id},
           ${inp.external_source},
           ${addrPending},
           ${emailPending},
           '[]'::jsonb)
      `;
      inserted += 1;
    }
  }

  return { inserted, updated, unchanged, suppressed_skipped };
}

