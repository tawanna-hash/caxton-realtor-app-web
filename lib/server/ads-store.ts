/**
 * Ads store — Neon. Backs all admin ads routes and the public
 * /ads/active endpoint. Ported from caxton-realtor-api/services/ads-store.ts.
 */

import { getPool } from './db/neon';
import { publicationToPubId, type PublicationId, type PublicationScope } from '@/lib/publications';

export type Publication = PublicationScope;

export interface AdSpace {
  slug: string;
  display_name: string;
  zone: string;
  tier: string;
  sizes_json: unknown;
  notes: string | null;
}

export interface AdCreative {
  id: string;
  advertiser_name: string;
  blob_url: string;
  width: number | null;
  height: number | null;
  click_url: string;
  alt_text: string | null;
  uploaded_by: string;
  uploaded_at: string;
}

export interface AdCampaign {
  id: string;
  advertiser_name: string;
  ad_space_slug: string;
  creative_id: string;
  publication: Publication;
  start_date: string;
  end_date: string;
  active: boolean;
  /** 'draft' | 'pending' | 'approved' — self-serve approval lifecycle. */
  approval_status: string;
  price_total: string | null;
  price_notes: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AdCampaignWithRefs extends AdCampaign {
  ad_space: AdSpace;
  creative: AdCreative;
}

// -----------------------------------------------------------------------------
// Spaces
// -----------------------------------------------------------------------------

export async function listAdSpaces(): Promise<AdSpace[]> {
  const r = await getPool().query<AdSpace>(
    `SELECT slug, display_name, zone, tier, sizes_json, notes
       FROM ad_spaces ORDER BY zone, slug`,
  );
  return r.rows;
}

// -----------------------------------------------------------------------------
// Creatives
// -----------------------------------------------------------------------------

export async function listCreatives(): Promise<AdCreative[]> {
  const r = await getPool().query<AdCreative>(
    `SELECT id, advertiser_name, blob_url, width, height, click_url, alt_text,
            uploaded_by, uploaded_at
       FROM ad_creatives ORDER BY uploaded_at DESC`,
  );
  return r.rows;
}

export async function createCreative(input: {
  advertiser_name: string;
  blob_url: string;
  width: number | null;
  height: number | null;
  click_url: string;
  alt_text: string | null;
  uploaded_by: string;
}): Promise<AdCreative> {
  const r = await getPool().query<AdCreative>(
    `INSERT INTO ad_creatives
       (advertiser_name, blob_url, width, height, click_url, alt_text, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.advertiser_name,
      input.blob_url,
      input.width,
      input.height,
      input.click_url,
      input.alt_text,
      input.uploaded_by,
    ],
  );
  return r.rows[0]!;
}

export async function updateCreative(
  id: string,
  patch: {
    advertiser_name?: string;
    width?: number | null;
    height?: number | null;
    click_url?: string;
    alt_text?: string | null;
  },
): Promise<AdCreative | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    fields.push(`${k} = $${i++}`);
    values.push(v);
  }
  if (fields.length === 0) {
    const cur = await getPool().query<AdCreative>(
      `SELECT id, advertiser_name, blob_url, width, height, click_url, alt_text,
              uploaded_by, uploaded_at
         FROM ad_creatives WHERE id = $1`,
      [id],
    );
    return cur.rows[0] ?? null;
  }
  values.push(id);
  const r = await getPool().query<AdCreative>(
    `UPDATE ad_creatives SET ${fields.join(', ')}
      WHERE id = $${i}
      RETURNING id, advertiser_name, blob_url, width, height, click_url, alt_text,
                uploaded_by, uploaded_at`,
    values,
  );
  return r.rows[0] ?? null;
}

export async function deleteCreative(
  id: string,
): Promise<{ deleted: boolean; reason?: string }> {
  const refs = await getPool().query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ad_campaigns WHERE creative_id = $1`,
    [id],
  );
  const n = refs.rows[0]?.n ?? 0;
  if (n > 0) {
    return { deleted: false, reason: `Referenced by ${n} campaign(s).` };
  }
  const r = await getPool().query(`DELETE FROM ad_creatives WHERE id = $1 RETURNING id`, [id]);
  return { deleted: (r.rowCount ?? 0) > 0 };
}

// -----------------------------------------------------------------------------
// Campaigns
// -----------------------------------------------------------------------------

export async function listCampaigns(): Promise<AdCampaignWithRefs[]> {
  const r = await getPool().query<AdCampaignWithRefs>(
    `SELECT
       c.*,
       row_to_json(s.*) AS ad_space,
       row_to_json(cr.*) AS creative
     FROM ad_campaigns c
     JOIN ad_spaces s ON s.slug = c.ad_space_slug
     JOIN ad_creatives cr ON cr.id = c.creative_id
     ORDER BY c.created_at DESC`,
  );
  return r.rows;
}

export async function createCampaign(input: {
  advertiser_name: string;
  ad_space_slug: string;
  creative_id: string;
  publication: Publication;
  start_date: string;
  end_date: string;
  price_total: number | null;
  price_notes: string | null;
  notes: string | null;
  created_by: string;
}): Promise<AdCampaign> {
  const r = await getPool().query<AdCampaign>(
    `INSERT INTO ad_campaigns
       (advertiser_name, ad_space_slug, creative_id, publication,
        start_date, end_date, price_total, price_notes, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      input.advertiser_name,
      input.ad_space_slug,
      input.creative_id,
      input.publication,
      input.start_date,
      input.end_date,
      input.price_total,
      input.price_notes,
      input.notes,
      input.created_by,
    ],
  );
  return r.rows[0]!;
}

export type CampaignPatch = Partial<{
  advertiser_name: string;
  ad_space_slug: string;
  creative_id: string;
  publication: Publication;
  start_date: string;
  end_date: string;
  price_total: number | null;
  price_notes: string | null;
  notes: string | null;
}>;

export async function updateCampaign(
  id: string,
  patch: CampaignPatch,
): Promise<AdCampaign | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(patch)) {
    fields.push(`${k} = $${i++}`);
    values.push(v);
  }
  if (fields.length === 0) {
    const r = await getPool().query<AdCampaign>(`SELECT * FROM ad_campaigns WHERE id = $1`, [id]);
    return r.rows[0] ?? null;
  }
  fields.push(`updated_at = NOW()`);
  values.push(id);
  const r = await getPool().query<AdCampaign>(
    `UPDATE ad_campaigns SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values,
  );
  return r.rows[0] ?? null;
}

export async function deleteCampaign(id: string): Promise<boolean> {
  const r = await getPool().query(`DELETE FROM ad_campaigns WHERE id = $1`, [id]);
  return (r.rowCount ?? 0) > 0;
}

export async function toggleCampaign(id: string): Promise<AdCampaign | null> {
  const r = await getPool().query<AdCampaign>(
    `UPDATE ad_campaigns SET active = NOT active, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id],
  );
  return r.rows[0] ?? null;
}

export type ApproveCampaignState =
  | 'approved' // just transitioned pending -> live
  | 'already_live' // no-op: was already approved + active (idempotent)
  | 'not_pending' // refused: draft/unpaid or otherwise not awaiting approval
  | 'not_found';

/**
 * Approve a paid, pending self-serve campaign and take it live. Only the
 * pending -> approved transition activates the campaign, so this is safe to
 * call repeatedly (idempotent). A draft (unpaid) campaign is refused —
 * approval must never bypass the paid gate. The linked self-serve agreement
 * (matched by the pi id embedded in campaign.notes) is flipped to 'active'
 * as a best-effort side effect.
 */
export async function approveSelfServeCampaign(
  id: string,
): Promise<{ campaign: AdCampaign | null; state: ApproveCampaignState }> {
  const pool = getPool();
  const cur = await pool.query<AdCampaign>(
    `SELECT * FROM ad_campaigns WHERE id = $1`,
    [id],
  );
  const row = cur.rows[0];
  if (!row) return { campaign: null, state: 'not_found' };
  if (row.active && row.approval_status === 'approved') {
    return { campaign: row, state: 'already_live' };
  }
  if (row.approval_status !== 'pending') {
    return { campaign: row, state: 'not_pending' };
  }

  const upd = await pool.query<AdCampaign>(
    `UPDATE ad_campaigns
        SET active = true, approval_status = 'approved', updated_at = NOW()
      WHERE id = $1 AND approval_status = 'pending'
      RETURNING *`,
    [id],
  );
  const campaign = upd.rows[0] ?? row;

  // Best-effort: bring the linked self-serve agreement to 'active' too so the
  // pipeline reflects the go-live. notes format: 'self-serve checkout, pi=<id>'.
  const pi = /pi=(\S+)/.exec(row.notes ?? '')?.[1] ?? null;
  if (pi) {
    await pool.query(
      `UPDATE agreements SET status = 'active', updated_at = NOW()
        WHERE stripe_payment_intent_id = $1`,
      [pi],
    );
  }

  return { campaign, state: 'approved' };
}

// Public-facing: return ONE active campaign for a given (slot, publication).
// Random selection done in SQL. Returns null if nothing matches.
export async function getActiveCampaignForSlot(
  slot: string,
  publication: PublicationId,
): Promise<AdCampaignWithRefs | null> {
  const rows = await getActiveCampaignsForSlot(slot, publication, 1);
  return rows[0] ?? null;
}

// Public-facing: return UP TO N active campaigns for a (slot, publication).
// Used by banner-shaped slots that rotate multiple creatives client-side.
// SQL randomizes order so each request returns a fresh shuffle.
export async function getActiveCampaignsForSlot(
  slot: string,
  publication: PublicationId,
  limit = 5,
): Promise<AdCampaignWithRefs[]> {
  const today = new Date().toISOString().slice(0, 10);
  const pubKey = publicationToPubId(publication);
  const safeLimit = Math.max(1, Math.min(20, Math.floor(limit)));
  const r = await getPool().query<AdCampaignWithRefs>(
    `SELECT
       c.*,
       row_to_json(s.*) AS ad_space,
       row_to_json(cr.*) AS creative
     FROM ad_campaigns c
     JOIN ad_spaces s ON s.slug = c.ad_space_slug
     JOIN ad_creatives cr ON cr.id = c.creative_id
     WHERE c.active = TRUE
       AND c.ad_space_slug = $1
       AND (
         c.publication = $2
         OR c.publication = 'both'
         OR $4 = ANY(c.pubs)
       )
       AND c.start_date <= $3
       AND c.end_date   >= $3
     ORDER BY RANDOM()
     LIMIT ${safeLimit}`,
    [slot, publication, today, pubKey],
  );
  return r.rows;
}
