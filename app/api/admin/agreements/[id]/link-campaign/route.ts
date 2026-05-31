// app/api/admin/agreements/[id]/link-campaign/route.ts
//
// POST   — link an ad_campaign to this agreement
//          Body: { ad_campaign_id: string | null }
//          Setting ad_campaign_id=null unlinks any current campaign for this agreement.
//          Setting a new ad_campaign_id clears any prior campaigns linked to this
//          agreement, then sets the new one (one-to-one for now).
// GET    — return the ad_campaign currently linked to this agreement (or null)

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteCtx = { params: Promise<{ id: string }> };

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      SELECT id, advertiser_name, ad_space_slug, publication, start_date, end_date, active
        FROM ad_campaigns
       WHERE agreement_id = ${id}
       ORDER BY created_at DESC
       LIMIT 1
    ` as unknown as Array<Record<string, unknown>>;
    return NextResponse.json({ campaign: rows[0] ?? null });
  } catch (err) {
    return NextResponse.json({ error: 'get failed', detail: errMessage(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  let body: { ad_campaign_id?: string | null };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const campaignId = body.ad_campaign_id ?? null;
  if (campaignId !== null && (typeof campaignId !== 'string' || !UUID_RE.test(campaignId))) {
    return NextResponse.json({ error: 'ad_campaign_id must be a uuid or null' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();

    // Verify the agreement exists.
    const agExists = await sql`SELECT 1 FROM agreements WHERE id = ${id}` as unknown as unknown[];
    if (agExists.length === 0) {
      return NextResponse.json({ error: 'agreement not found' }, { status: 404 });
    }

    // Clear any prior campaigns linked to this agreement.
    await sql`UPDATE ad_campaigns SET agreement_id = NULL, updated_at = NOW() WHERE agreement_id = ${id}`;

    // Set the new campaign link (if any).
    if (campaignId) {
      const linked = await sql`
        UPDATE ad_campaigns SET agreement_id = ${id}, updated_at = NOW()
         WHERE id = ${campaignId}
         RETURNING id, advertiser_name, ad_space_slug, publication, start_date, end_date, active
      ` as unknown as Array<Record<string, unknown>>;
      if (linked.length === 0) {
        return NextResponse.json({ error: 'campaign not found' }, { status: 404 });
      }
      return NextResponse.json({ campaign: linked[0] });
    }
    return NextResponse.json({ campaign: null });
  } catch (err) {
    console.error('[admin/agreements/link-campaign POST]', errMessage(err));
    return NextResponse.json({ error: 'link failed', detail: errMessage(err) }, { status: 500 });
  }
}
