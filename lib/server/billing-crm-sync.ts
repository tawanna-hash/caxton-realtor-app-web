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
