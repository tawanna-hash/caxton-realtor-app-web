// app/api/admin/advertisers/[id]/website-sync/route.ts
//
//   POST — pulls fresh locations + staff from the advertiser's own
//   website (when a known sync source is configured for that domain)
//   and upserts them into the CRM. Idempotent: safe to click multiple
//   times.
//
//   GET  — returns { source: { label } | null } so the admin UI knows
//   whether to show the Sync button for this advertiser.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { getSql, ensureSchema } from '@/lib/db';
import { getSyncSourceForWebsite } from '@/lib/server/website-sync';
import { syncAdvertiserFromWebsite } from '@/lib/server/website-sync/upsert';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type RouteCtx = { params: Promise<{ id: string }> };

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

async function loadAdvertiser(idNum: number): Promise<{ id: number; website: string | null } | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT id, website FROM advertisers WHERE id = ${idNum} LIMIT 1
  `) as unknown as Array<{ id: number; website: string | null }>;
  return rows[0] ?? null;
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const adv = await loadAdvertiser(idNum);
  if (!adv) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const source = getSyncSourceForWebsite(adv.website);
  return NextResponse.json({
    source: source ? { label: source.label } : null,
    website: adv.website,
  });
}

export const POST = withAdminTracking(async function POST(_req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const adv = await loadAdvertiser(idNum);
  if (!adv) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const source = getSyncSourceForWebsite(adv.website);
  if (!source) {
    return NextResponse.json(
      {
        error: 'no sync source configured for this website',
        website: adv.website,
      },
      { status: 400 },
    );
  }

  let data;
  try {
    data = await source.fetch();
  } catch (err) {
    return NextResponse.json(
      { error: 'website fetch failed', detail: errMessage(err) },
      { status: 502 },
    );
  }

  try {
    const counts = await syncAdvertiserFromWebsite({
      advertiserId: idNum,
      data,
    });
    return NextResponse.json({
      source: source.label,
      extracted: {
        locations: data.locations.length,
        staff: data.staff.length,
      },
      counts,
    });
  } catch (err) {
    console.error('[website-sync] insert failed:', err);
    return NextResponse.json(
      { error: 'sync write failed', detail: errMessage(err) },
      { status: 500 },
    );
  }
});
