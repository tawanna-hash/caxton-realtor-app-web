// lib/advertisers-from-agreement.ts
//
// Idempotently create or link an `advertisers` row for an agreement that has
// just been signed. Mirrors the canonical POST /api/admin/advertisers logic
// (slug allocation with -N suffix on collision, share token generation,
// mailing-segment mirror) so the signed advertiser shows up on
// /admin/advertisers without any manual step.

import { getSql } from '@/lib/db';
import { slugify, generateShareToken, type Advertiser } from '@/lib/advertisers';
import { upsertAdvertiserMailingByAdvertiserId } from '@/lib/mailing';
import type { Agreement } from '@/lib/agreements';

/**
 * Result describes what happened so callers can audit-log it.
 *  - `linked`   — the agreement already pointed at an existing advertiser
 *  - `matched`  — found existing advertiser by contact_email or name+slug
 *  - `created`  — brand-new advertiser row
 *  - `skipped`  — couldn't derive a usable name; nothing was done
 */
export type EnsureAdvertiserResult =
  | { outcome: 'linked';  advertiserId: number }
  | { outcome: 'matched'; advertiserId: number }
  | { outcome: 'created'; advertiserId: number; slug: string }
  | { outcome: 'skipped'; reason: string };

/** Derive the advertiser display name from the agreement fields. */
function pickAdvertiserName(ag: Agreement): string {
  const candidates = [
    ag.company_name,
    ag.rep_name,
    ag.billing_contact_name,
    ag.signer_name,
  ];
  for (const c of candidates) {
    const trimmed = (c ?? '').trim();
    if (trimmed) return trimmed;
  }
  return '';
}

/** Pick the best contact email available on the agreement. */
function pickContactEmail(ag: Agreement): string | null {
  const candidates = [ag.advertiser_email, ag.billing_email, ag.sent_to_email];
  for (const c of candidates) {
    const trimmed = (c ?? '').trim();
    if (trimmed) return trimmed.toLowerCase();
  }
  return null;
}

/**
 * Ensure an `advertisers` row exists for this agreement and that
 * `agreements.advertiser_id` is set to its id. Safe to call repeatedly.
 */
/**
 * Options that control side effects when linking/creating an advertiser
 * for an agreement.
 *
 *  - `desiredStatus`: what the advertiser's `status` should be when the
 *    helper is done.
 *      * 'prospect' — used for draft/sent agreements. Brand-new rows are
 *        created as prospect. Existing rows are NEVER demoted.
 *      * 'advertiser' — used when an agreement is signed. New rows are
 *        created as advertiser. Existing rows with status='prospect' get
 *        promoted to 'advertiser'. Other statuses are left alone.
 */
export type EnsureAdvertiserOptions = {
  desiredStatus?: 'prospect' | 'advertiser';
};

export async function ensureAdvertiserForAgreement(
  ag: Agreement,
  opts: EnsureAdvertiserOptions = {},
): Promise<EnsureAdvertiserResult> {
  const sql = getSql();
  const desiredStatus: 'prospect' | 'advertiser' = opts.desiredStatus ?? 'prospect';

  // Promote an existing advertiser from 'prospect' to 'advertiser' when the
  // caller signals that this agreement is now signed. Never demote, never
  // touch 'archived' rows.
  async function maybePromote(advertiserId: number): Promise<void> {
    if (desiredStatus !== 'advertiser') return;
    await sql`
      UPDATE advertisers
         SET status = 'advertiser', updated_at = NOW()
       WHERE id = ${advertiserId}
         AND COALESCE(status, 'prospect') = 'prospect'
    `;
  }

  // 1) Already linked → promote on signed transitions, then return.
  if (typeof ag.advertiser_id === 'number' && ag.advertiser_id > 0) {
    await maybePromote(ag.advertiser_id);
    return { outcome: 'linked', advertiserId: ag.advertiser_id };
  }

  // 2) Match by contact_email (case-insensitive).
  const contactEmail = pickContactEmail(ag);
  if (contactEmail) {
    const byEmail = (await sql`
      SELECT id FROM advertisers
      WHERE LOWER(contact_email) = ${contactEmail}
      LIMIT 1
    `) as unknown as Array<{ id: number }>;
    if (byEmail.length > 0) {
      const advertiserId = byEmail[0].id;
      await sql`UPDATE agreements SET advertiser_id = ${advertiserId} WHERE id = ${ag.id}`;
      await maybePromote(advertiserId);
      return { outcome: 'matched', advertiserId };
    }
  }

  // 3) Match by exact slug derived from name.
  const name = pickAdvertiserName(ag);
  if (!name) {
    return { outcome: 'skipped', reason: 'no usable name on agreement' };
  }

  const baseSlug = slugify(name) || `advertiser-${Date.now()}`;
  const bySlug = (await sql`
    SELECT id FROM advertisers WHERE slug = ${baseSlug} LIMIT 1
  `) as unknown as Array<{ id: number }>;
  if (bySlug.length > 0) {
    // Slug collision but no email match — only treat as "matched" if the
    // existing row has no contact_email (likely the same business added
    // earlier). Otherwise treat as a distinct advertiser and allocate a
    // suffixed slug below.
    const existingFull = (await sql`
      SELECT id, contact_email FROM advertisers WHERE id = ${bySlug[0].id} LIMIT 1
    `) as unknown as Array<{ id: number; contact_email: string | null }>;
    if (existingFull.length > 0 && !existingFull[0].contact_email) {
      const advertiserId = existingFull[0].id;
      if (contactEmail) {
        await sql`UPDATE advertisers SET contact_email = ${contactEmail}, updated_at = NOW() WHERE id = ${advertiserId}`;
      }
      await sql`UPDATE agreements SET advertiser_id = ${advertiserId} WHERE id = ${ag.id}`;
      await maybePromote(advertiserId);
      return { outcome: 'matched', advertiserId };
    }
  }

  // 4) Allocate a unique slug.
  let slug = baseSlug;
  let suffix = 2;
  while (true) {
    const dup = (await sql`
      SELECT id FROM advertisers WHERE slug = ${slug} LIMIT 1
    `) as unknown as Array<{ id: number }>;
    if (dup.length === 0) break;
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
    if (suffix > 100) {
      return { outcome: 'skipped', reason: 'could not allocate slug' };
    }
  }

  const shareToken = generateShareToken();
  const publication = 'austin'; // RealtyLine default; matches POST route fallback.

  const inserted = (await sql`
    INSERT INTO advertisers (
      name, slug, share_token, contact_email,
      requires_email_gate, publication, status, created_at, updated_at
    ) VALUES (
      ${name}, ${slug}, ${shareToken}, ${contactEmail},
      false, ${publication}, ${desiredStatus}, NOW(), NOW()
    )
    RETURNING *
  `) as unknown as Advertiser[];

  const newId = inserted[0]?.id;
  if (typeof newId !== 'number') {
    return { outcome: 'skipped', reason: 'insert returned no id' };
  }

  // Link the agreement to the new advertiser.
  await sql`UPDATE agreements SET advertiser_id = ${newId} WHERE id = ${ag.id}`;

  // Mirror into mailing segment (best-effort; same pattern as POST route).
  try {
    await upsertAdvertiserMailingByAdvertiserId(newId);
  } catch (err) {
    console.warn(
      '[advertisers-from-agreement] mailing upsert failed:',
      err instanceof Error ? err.message : String(err),
    );
  }

  return { outcome: 'created', advertiserId: newId, slug };
}
