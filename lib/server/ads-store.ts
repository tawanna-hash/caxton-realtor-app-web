/**
 * Ads store — Neon. Backs all admin ads routes and the public
 * /ads/active endpoint. Ported from caxton-realtor-api/services/ads-store.ts.
 */

import { getPool } from './db/neon';

export type Publication = 'austin' | 'san_antonio' | 'both';

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

// Public-facing: return ONE active campaign for a given (slot, publication).
// Random selection done in SQL. Returns null if nothing matches.
export async function getActiveCampaignForSlot(
  slot: string,
  publication: 'austin' | 'san_antonio',
): Promise<AdCampaignWithRefs | null> {
  const today = new Date().toISOString().slice(0, 10);
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
       AND (c.publication = $2 OR c.publication = 'both')
       AND c.start_date <= $3
       AND c.end_date   >= $3
     ORDER BY RANDOM()
     LIMIT 1`,
    [slot, publication, today],
  );
  return r.rows[0] ?? null;
}
