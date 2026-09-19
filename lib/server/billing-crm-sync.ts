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

/** Whether an optional agreement column exists in this deployment. */
async function agreementHasColumn(column: 'address_2'): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'agreements'
       AND column_name = ${column}
     LIMIT 1
  `;
  return rows.length > 0;
}

/**
 * Pick the most-recent "active-ish" agreement for an advertiser.
 * Preference order: signed > active > sent > proposal approved >
 * proposal sent > draft, then most recent sign_date / created_at.
 *
 * Expired and cancelled rows are deliberately excluded: neither is a valid
 * replacement for the advertiser's current agreement mirror.
 */
async function pickCurrentAgreementId(advertiserId: number): Promise<string | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id
      FROM agreements
     WHERE advertiser_id = ${advertiserId}
       AND status IN (
         'signed', 'active', 'sent', 'proposal_approved',
         'proposal_sent', 'draft'
       )
     ORDER BY
       CASE status
         WHEN 'signed'            THEN 0
         WHEN 'active'            THEN 1
         WHEN 'sent'              THEN 2
         WHEN 'proposal_approved' THEN 3
         WHEN 'proposal_sent'     THEN 4
         WHEN 'draft'             THEN 5
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
 *    phone, address) — mirrors only for the current agreement. This makes
 *    deliberate clears flow in both directions without allowing a historical
 *    agreement to overwrite the live CRM row.
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

  const updates: string[] = [];

  // ── Identity ────────────────────────────────────────────────────
  if (isCurrent) {
    const company = nz(ag.company_name);
    const repName = nz(ag.rep_name);
    const { first, last } = splitName(repName);
    const email = nz(ag.advertiser_email)?.toLowerCase() ?? null;
    const phone = nz(ag.advertiser_phone);
    // Prefer the structured Pressbook address, falling back to the legacy
    // single-line value only when the structured value is absent.
    const addr = nz(ag.address) ?? nz(ag.advertiser_address);

    await sql`
      UPDATE advertisers SET
        name          = COALESCE(${repName}, name),
        company       = ${company},
        first_name    = ${first},
        last_name     = ${last},
        contact_email = ${email},
        portal_email  = ${email},
        phone         = ${phone},
        address       = ${addr},
        city          = ${nz(ag.city)},
        state         = ${nz(ag.state)},
        zip           = ${nz(ag.zip)}
      WHERE id = ${advertiserId}
    `;
    updates.push(
      'name', 'company', 'first_name', 'last_name', 'contact_email',
      'portal_email', 'phone', 'address', 'city', 'state', 'zip',
    );

    // Some databases already carry a structured second address line on
    // agreements, while the baseline schema does not. Mirror it only where
    // both sides support that lossless mapping; otherwise leave the CRM's
    // address_2 untouched.
    if (await agreementHasColumn('address_2')) {
      const address2 = nz((ag as Agreement & { address_2?: string | null }).address_2);
      await sql`UPDATE advertisers SET address_2 = ${address2} WHERE id = ${advertiserId}`;
      updates.push('address_2');
    }
  }

  // ── Billing contact + payment (overwrite — agreement is source) ─
  // Only mirror onto the advertiser cache when this agreement is the
  // current one for the advertiser; otherwise leave the cache alone.
  if (isCurrent) {
    const billingName  = nz(ag.billing_contact_name) ?? nz(ag.billing_name);
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

const MIRROR_FIELDS = [
  'billing_contact_name',
  'billing_contact_phone',
  'billing_email',
  'payment_mode',
  'stripe_customer_id',
  'card_last4',
  'current_agreement_id',
  'current_ad_size',
  'current_frequency',
  'current_ad_rate_cents',
  'current_amount_cents',
  'current_exp_date',
] as const;

/**
 * Recompute an advertiser's agreement-backed cache.
 *
 * Used after ownership changes and deletion, where synchronizing only the
 * agreement being edited is insufficient. If another valid agreement exists
 * it is promoted; otherwise every agreement-backed companion field is
 * cleared together so stale billing/deal data cannot remain visible.
 */
export async function refreshAdvertiserAgreementMirror(
  advertiserId: number,
): Promise<string[]> {
  const sql = getSql();
  const currentId = await pickCurrentAgreementId(advertiserId);

  if (!currentId) {
    await sql`
      UPDATE advertisers SET
        billing_contact_name  = NULL,
        billing_contact_phone = NULL,
        billing_email         = NULL,
        payment_mode          = NULL,
        stripe_customer_id    = NULL,
        card_last4            = NULL,
        current_agreement_id  = NULL,
        current_ad_size       = NULL,
        current_frequency     = NULL,
        current_ad_rate_cents = NULL,
        current_amount_cents  = NULL,
        current_exp_date      = NULL,
        updated_at            = NOW()
      WHERE id = ${advertiserId}
    `;
    return [...MIRROR_FIELDS];
  }

  const rows = (await sql`
    SELECT * FROM agreements WHERE id = ${currentId} LIMIT 1
  `) as unknown as Agreement[];
  if (rows.length === 0) return [];
  return syncAgreementToAdvertiser(rows[0]);
}

/**
 * Mirror contact/identity edits made on the advertiser row back onto the
 * advertiser's current (most-recent active-ish) agreement.
 *
 * Only mirrors fields that map cleanly to the agreement snapshot:
 *  - company → company_name
 *  - first_name + last_name → rep_name (if both present)
 *  - contact_email / portal_email → advertiser_email
 *  - phone → advertiser_phone
 *  - address / city / state / zip → same columns
 *  - agreement-backed billing cache → matching agreement billing fields
 *
 * Values are assigned directly so intentional clears are preserved. The
 * WHERE clause targets exactly one current agreement and therefore never
 * rewrites unrelated historical agreements.
 */
export async function syncAdvertiserToAgreement(advertiserId: number): Promise<string[]> {
  const sql = getSql();

  const currentId = await pickCurrentAgreementId(advertiserId);
  if (!currentId) return [];

  const advRows = (await sql`
    SELECT company, first_name, last_name, contact_email, portal_email, phone,
           address, address_2, city, state, zip,
           billing_contact_name, billing_contact_phone, billing_email,
           payment_mode, stripe_customer_id, card_last4
      FROM advertisers
     WHERE id = ${advertiserId}
     LIMIT 1
  `) as unknown as Array<{
    company: string | null;
    first_name: string | null;
    last_name: string | null;
    contact_email: string | null;
    portal_email: string | null;
    phone: string | null;
    address: string | null;
    address_2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    billing_contact_name: string | null;
    billing_contact_phone: string | null;
    billing_email: string | null;
    payment_mode: string | null;
    stripe_customer_id: string | null;
    card_last4: string | null;
  }>;
  if (advRows.length === 0) return [];
  const adv = advRows[0];

  const repName = [nz(adv.first_name), nz(adv.last_name)].filter(Boolean).join(' ') || null;
  const company = nz(adv.company);
  const email   = nz(adv.contact_email ?? adv.portal_email)?.toLowerCase() ?? null;
  const phone   = nz(adv.phone);
  const addr    = nz(adv.address);
  const city    = nz(adv.city);
  const state   = nz(adv.state);
  const zip     = nz(adv.zip);

  await sql`
    UPDATE agreements SET
      company_name          = ${company},
      rep_name              = ${repName},
      advertiser_email      = ${email},
      advertiser_phone      = ${phone},
      address               = ${addr},
      city                  = ${city},
      state                 = ${state},
      zip                   = ${zip},
      billing_contact_name  = ${nz(adv.billing_contact_name)},
      billing_contact_phone = ${nz(adv.billing_contact_phone)},
      billing_email         = ${nz(adv.billing_email)},
      payment_mode          = ${nz(adv.payment_mode)},
      stripe_customer_id    = ${nz(adv.stripe_customer_id)},
      card_number_last4     = ${nz(adv.card_last4)},
      updated_at         = NOW()
    WHERE id = ${currentId}
  `;

  // `agreements.address_2` is optional across deployments. Keep it symmetric
  // when present without making older schemas fail the whole synchronization.
  const hasAddress2 = await agreementHasColumn('address_2');
  if (hasAddress2) {
    await sql.query(
      'UPDATE agreements SET address_2 = $1, updated_at = NOW() WHERE id = $2',
      [nz(adv.address_2), currentId],
    );
  }

  return [
    'company_name', 'rep_name', 'advertiser_email', 'advertiser_phone',
    'address', ...(hasAddress2 ? ['address_2'] : []),
    'city', 'state', 'zip', 'billing_contact_name', 'billing_contact_phone',
    'billing_email', 'payment_mode', 'stripe_customer_id', 'card_number_last4',
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
