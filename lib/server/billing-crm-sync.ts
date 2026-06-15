// lib/server/billing-crm-sync.ts
//
// Billing <-> CRM two-way sync.
//
// Goal: anything edited in the Billing agreement drawer auto-populates onto
// the advertiser's CRM row, and any contact/address edit on the CRM
// advertiser flows back onto the advertiser's current (active) agreement.
//
// The source of truth for billing/payment/deal facts is still the
// `agreements` row. The advertiser table holds a mirrored cache of those
// fields (billing_contact_*, payment_mode, stripe_customer_id, card_last4,
// current_ad_size / frequency / ad_rate_cents / amount_cents / exp_date,
// current_agreement_id) so the CRM detail page can render the current
// contract in one query.
//
// Used by:
//   - app/api/admin/agreements/route.ts            (POST)
//   - app/api/admin/agreements/[id]/route.ts       (PATCH)
//   - app/api/admin/advertisers/[id]/route.ts      (PATCH — reverse direction)
//   - app/api/admin/advertisers/backfill-from-agreements/route.ts (PR C)
//
// Always wrapped in try/catch by callers — never block the user-facing
// save if a mirror hiccups.

import { getSql } from '@/lib/db';
import type { Agreement } from '@/lib/agreements';

/** Trim helper that collapses '' to null. */
function nz(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

/** Best-effort split of "First Last" into first/last halves. */
function splitName(full: string | null | undefined): { first: string | null; last: string | null } {
  const trimmed = nz(full ?? null);
  if (!trimmed) return { first: null, last: null };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: null };
  return {
    first: parts[0],
    last: parts.slice(1).join(' '),
  };
}

/**
 * Pick the most-recent "active-ish" agreement for an advertiser.
 * Preference order: signed > active > sent > draft, then most recent
 * sign_date / created_at.
 */
async function pickCurrentAgreementId(advertiserId: number): Promise<string | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id
      FROM agreements
     WHERE advertiser_id = ${advertiserId}
     ORDER BY
       CASE status
         WHEN 'signed'    THEN 0
         WHEN 'active'    THEN 1
         WHEN 'sent'      THEN 2
         WHEN 'draft'     THEN 3
         WHEN 'expired'   THEN 4
         WHEN 'cancelled' THEN 5
         ELSE 6
       END,
       COALESCE(signed_at, created_at) DESC
     LIMIT 1
  `) as unknown as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

/**
 * Mirror an agreement's contact / billing / payment / deal facts onto
 * its linked advertiser row.
 *
 *  - Contact identity (company, rep_name → name + first/last, contact email,
 *    phone, address) — only fills in BLANK fields on the advertiser so we
 *    never clobber a manually-curated CRM value.
 *  - Billing + payment fields — overwrite unconditionally; agreement is
 *    the source of truth.
 *  - Deal facts (current_*) — overwrite unconditionally.
 *
 * Returns the list of advertiser columns that were updated (for audit log).
 */
export async function syncAgreementToAdvertiser(ag: Agreement): Promise<string[]> {
  if (!ag.advertiser_id) return [];
  const sql = getSql();
  const advertiserId = ag.advertiser_id;

  // Only mirror onto the advertiser when this agreement IS the advertiser's
  // current one — otherwise an edit on an old/expired agreement would
  // overwrite live CRM data.
  const currentId = await pickCurrentAgreementId(advertiserId);
  const isCurrent = currentId === ag.id;

  // Fetch current advertiser snapshot to decide which identity fields to
  // overwrite (we only fill blanks).
  const advRows = (await sql`
    SELECT id, name, company, first_name, last_name, contact_email, portal_email,
           phone, address, city, state, zip
      FROM advertisers
     WHERE id = ${advertiserId}
     LIMIT 1
  `) as unknown as Array<{
    id: number;
    name: string | null;
    company: string | null;
    first_name: string | null;
    last_name: string | null;
    contact_email: string | null;
    portal_email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  }>;
  if (advRows.length === 0) return [];
  const adv = advRows[0];

  const updates: string[] = [];

  // ── Identity (fill-blank only) ─────────────────────────────────
  const company = nz(ag.company_name);
  if (company && !nz(adv.company)) {
    await sql`UPDATE advertisers SET company = ${company} WHERE id = ${advertiserId}`;
    updates.push('company');
  }

  const repName = nz(ag.rep_name);
  if (repName && !nz(adv.name)) {
    // Advertiser.name is NOT NULL — only overwrite when blank-ish.
    await sql`UPDATE advertisers SET name = ${repName} WHERE id = ${advertiserId}`;
    updates.push('name');
  }
  if (repName) {
    const { first, last } = splitName(repName);
    if (first && !nz(adv.first_name)) {
      await sql`UPDATE advertisers SET first_name = ${first} WHERE id = ${advertiserId}`;
      updates.push('first_name');
    }
    if (last && !nz(adv.last_name)) {
      await sql`UPDATE advertisers SET last_name = ${last} WHERE id = ${advertiserId}`;
      updates.push('last_name');
    }
  }

  const email = nz(ag.advertiser_email)?.toLowerCase() ?? null;
  if (email && !nz(adv.contact_email)) {
    await sql`UPDATE advertisers SET contact_email = ${email} WHERE id = ${advertiserId}`;
    updates.push('contact_email');
  }
  if (email && !nz(adv.portal_email)) {
    await sql`UPDATE advertisers SET portal_email = ${email} WHERE id = ${advertiserId}`;
    updates.push('portal_email');
  }

  const phone = nz(ag.advertiser_phone);
  if (phone && !nz(adv.phone)) {
    await sql`UPDATE advertisers SET phone = ${phone} WHERE id = ${advertiserId}`;
    updates.push('phone');
  }

  // Address — prefer the structured Pressbook columns, fall back to the
  // legacy single-line `advertiser_address`.
  const addr  = nz(ag.address)  ?? nz(ag.advertiser_address);
  const city  = nz(ag.city);
  const state = nz(ag.state);
  const zip   = nz(ag.zip);
  if (addr && !nz(adv.address)) {
    await sql`UPDATE advertisers SET address = ${addr} WHERE id = ${advertiserId}`;
    updates.push('address');
  }
  if (city && !nz(adv.city)) {
    await sql`UPDATE advertisers SET city = ${city} WHERE id = ${advertiserId}`;
    updates.push('city');
  }
  if (state && !nz(adv.state)) {
    await sql`UPDATE advertisers SET state = ${state} WHERE id = ${advertiserId}`;
    updates.push('state');
  }
  if (zip && !nz(adv.zip)) {
    await sql`UPDATE advertisers SET zip = ${zip} WHERE id = ${advertiserId}`;
    updates.push('zip');
  }

  // ── Billing contact + payment (overwrite — agreement is source) ─
  // Only mirror onto the advertiser cache when this agreement is the
  // current one for the advertiser; otherwise leave the cache alone.
  if (isCurrent) {
    const billingName  = nz(ag.billing_contact_name);
    const billingPhone = nz(ag.billing_contact_phone);
    const billingEmail = nz(ag.billing_email);
    const paymentMode  = nz(ag.payment_mode);
    const stripeCust   = nz(ag.stripe_customer_id);
    const cardLast4    = nz(ag.card_number_last4);

    await sql`
      UPDATE advertisers SET
        billing_contact_name  = ${billingName},
        billing_contact_phone = ${billingPhone},
        billing_email         = ${billingEmail},
        payment_mode          = ${paymentMode},
        stripe_customer_id    = ${stripeCust},
        card_last4            = ${cardLast4}
      WHERE id = ${advertiserId}
    `;
    updates.push(
      'billing_contact_name',
      'billing_contact_phone',
      'billing_email',
      'payment_mode',
      'stripe_customer_id',
      'card_last4',
    );

    // ── Deal facts ─────────────────────────────────────────────────
    await sql`
      UPDATE advertisers SET
        current_agreement_id   = ${ag.id},
        current_ad_size        = ${nz(ag.ad_size)},
        current_frequency      = ${nz(ag.frequency)},
        current_ad_rate_cents  = ${ag.ad_rate_cents ?? null},
        current_amount_cents   = ${ag.amount_cents ?? null},
        current_exp_date       = ${ag.exp_date ?? null}
      WHERE id = ${advertiserId}
    `;
    updates.push(
      'current_agreement_id',
      'current_ad_size',
      'current_frequency',
      'current_ad_rate_cents',
      'current_amount_cents',
      'current_exp_date',
    );
  }

  if (updates.length > 0) {
    await sql`UPDATE advertisers SET updated_at = NOW() WHERE id = ${advertiserId}`;
  }

  return updates;
}

/**
 * Mirror contact/identity edits made on the advertiser row back onto the
 * advertiser's current (most-recent active-ish) agreement.
 *
 * Only mirrors fields that map cleanly to the agreement snapshot:
 *  - company → company_name
 *  - first_name + last_name → rep_name (if both present)
 *  - contact_email → advertiser_email
 *  - phone → advertiser_phone
 *  - address / city / state / zip → same columns
 *
 * Uses COALESCE so a blank value on the advertiser never nulls out a
 * non-blank value on the agreement.
 */
export async function syncAdvertiserToAgreement(advertiserId: number): Promise<string[]> {
  const sql = getSql();

  const currentId = await pickCurrentAgreementId(advertiserId);
  if (!currentId) return [];

  const advRows = (await sql`
    SELECT company, first_name, last_name, contact_email, phone,
           address, city, state, zip
      FROM advertisers
     WHERE id = ${advertiserId}
     LIMIT 1
  `) as unknown as Array<{
    company: string | null;
    first_name: string | null;
    last_name: string | null;
    contact_email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  }>;
  if (advRows.length === 0) return [];
  const adv = advRows[0];

  const repName = [nz(adv.first_name), nz(adv.last_name)].filter(Boolean).join(' ') || null;
  const company = nz(adv.company);
  const email   = nz(adv.contact_email)?.toLowerCase() ?? null;
  const phone   = nz(adv.phone);
  const addr    = nz(adv.address);
  const city    = nz(adv.city);
  const state   = nz(adv.state);
  const zip     = nz(adv.zip);

  await sql`
    UPDATE agreements SET
      company_name       = COALESCE(${company}, company_name),
      rep_name           = COALESCE(${repName}, rep_name),
      advertiser_email   = COALESCE(${email}, advertiser_email),
      advertiser_phone   = COALESCE(${phone}, advertiser_phone),
      address            = COALESCE(${addr}, address),
      city               = COALESCE(${city}, city),
      state              = COALESCE(${state}, state),
      zip                = COALESCE(${zip}, zip),
      updated_at         = NOW()
    WHERE id = ${currentId}
  `;

  return [
    'company_name', 'rep_name', 'advertiser_email', 'advertiser_phone',
    'address', 'city', 'state', 'zip',
  ];
}


/**
 * On-sign side effect (added 2026-06-15 per owner spec):
 *
 * When an agreement is signed, ensure Locations & Staff has a primary
 * location built from the company address and a staff entry built from
 * the rep contact.
 *
 * Idempotent and additive:
 *   - If the advertiser already has ANY location, we don't create one
 *     (we never demote an existing primary).
 *   - If a staff entry with a matching name OR email already exists, we
 *     don't create a duplicate.
 *   - If the staff entry IS created and a primary location exists, the
 *     staff member is auto-assigned to that location.
 *
 * Safe to call multiple times. Never throws on partial data — missing
 * company/rep info just shrinks what we create.
 *
 * Returns a short list of what was created, for audit log.
 */
export async function syncAgreementToLocationsAndStaff(
  ag: Agreement,
): Promise<string[]> {
  if (!ag.advertiser_id) return [];
  const sql = getSql();
  const advertiserId = ag.advertiser_id;
  const created: string[] = [];

  // ── Location: build from company address ─────────────────────────
  const addr  = nz(ag.address) ?? nz(ag.advertiser_address);
  const city  = nz(ag.city);
  const state = nz(ag.state);
  const zip   = nz(ag.zip);

  // Only seed when we actually have address material AND no location
  // exists yet. We never touch an advertiser that already has manual
  // location data — operator wins.
  let primaryLocationId: string | null = null;
  if (addr || city || state || zip) {
    const existing = (await sql`
      SELECT id, is_primary FROM advertiser_locations
       WHERE advertiser_id = ${advertiserId}
       ORDER BY is_primary DESC, sort_order ASC, created_at ASC
       LIMIT 1
    `) as unknown as Array<{ id: string; is_primary: boolean }>;

    if (existing.length === 0) {
      const inserted = (await sql`
        INSERT INTO advertiser_locations (
          advertiser_id, label, address, address_2, city, state, zip,
          phone, email, hours, is_primary, sort_order
        ) VALUES (
          ${advertiserId},
          ${nz(ag.company_name) ?? 'Primary'},
          ${addr}, ${null},
          ${city}, ${state}, ${zip},
          ${nz(ag.advertiser_phone)},
          ${nz(ag.advertiser_email)?.toLowerCase() ?? null},
          ${null}, true, 0
        )
        RETURNING id
      `) as unknown as Array<{ id: string }>;
      if (inserted[0]?.id) {
        primaryLocationId = inserted[0].id;
        created.push('location');
      }
    } else {
      // Reuse the existing top-ranked location for staff assignment.
      primaryLocationId = existing[0].id;
    }
  }

  // ── Staff: build from rep contact ────────────────────────────────
  const repName  = nz(ag.rep_name);
  const repEmail = nz(ag.advertiser_email)?.toLowerCase() ?? null;
  const repPhone = nz(ag.advertiser_phone);

  if (repName || repEmail) {
    // Match by name (case/space-insensitive) OR email.
    const dup = (await sql`
      SELECT id FROM advertiser_staff
       WHERE advertiser_id = ${advertiserId}
         AND (
           (${repName}  IS NOT NULL AND LOWER(REGEXP_REPLACE(name,  '\\s+', '', 'g')) = LOWER(REGEXP_REPLACE(${repName}, '\\s+', '', 'g')))
           OR
           (${repEmail} IS NOT NULL AND LOWER(email) = ${repEmail})
         )
       LIMIT 1
    `) as unknown as Array<{ id: string }>;

    if (dup.length === 0 && repName) {
      // Staff.name is NOT NULL; require a name to insert. If we only have
      // an email, we skip — the operator can fill the staff entry by hand
      // later. (Inserting "Unknown" rows would just create noise.)
      const inserted = (await sql`
        INSERT INTO advertiser_staff (
          advertiser_id, name, title, email, phone, photo_url, sort_order
        ) VALUES (
          ${advertiserId}, ${repName}, ${null}, ${repEmail}, ${repPhone}, ${null}, 0
        )
        RETURNING id
      `) as unknown as Array<{ id: string }>;
      const staffId = inserted[0]?.id ?? null;

      if (staffId) {
        created.push('staff');
        if (primaryLocationId) {
          await sql`
            INSERT INTO advertiser_staff_locations (staff_id, location_id)
            VALUES (${staffId}::uuid, ${primaryLocationId}::uuid)
            ON CONFLICT DO NOTHING
          `;
        }
      }
    }
  }

  return created;
}
