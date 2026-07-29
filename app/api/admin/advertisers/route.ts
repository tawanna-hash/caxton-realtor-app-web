// app/api/admin/advertisers/route.ts
//
// Admin endpoints:
//   GET  — list all advertisers with hotspot_count + clicks_30d stats
//   POST — create new advertiser (handles slug collision with -2/-3 suffix)
//
// Auth: must hit /admin/auth/me with valid admin cookie.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import {
  slugify, generateShareToken,
  type Advertiser, type AdvertiserWithStats,
} from '@/lib/advertisers';
import {
  ensurePublicationColumn,
  parsePublications,
  serializePublications,
  isPublicationKey,
  type PublicationKey,
} from '@/lib/publication-theme';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { upsertAdvertiserMailingByAdvertiserId } from '@/lib/mailing';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function isAdmin(): Promise<boolean> {
  try {
    const admin = await getCurrentAdmin();
    return admin !== null;
  } catch {
    return false;
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

/**
 * Accept either a CSV string (legacy single-pub: 'austin', 'both', or
 * a new multi-pub CSV like 'austin,houston') or an array of pub keys.
 * Always returns a canonical CSV string ready to write to the DB.
 */
function normalizePublication(value: unknown): string {
  if (Array.isArray(value)) {
    const keys = value.filter(isPublicationKey) as PublicationKey[];
    return serializePublications(keys);
  }
  if (typeof value === 'string') {
    return serializePublications(parsePublications(value));
  }
  return 'austin';
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await ensureSchema();
    await ensurePublicationColumn();
    const sql = getSql();
    const rows = (await sql`
      SELECT
        a.*,
        (SELECT COUNT(*)::int FROM magazine_hotspots WHERE advertiser_id = a.id) AS hotspot_count,
        (SELECT COUNT(*)::int FROM magazine_hotspot_clicks c
          JOIN magazine_hotspots h ON c.hotspot_id = h.id
          WHERE h.advertiser_id = a.id
            AND c.occurred_at >= NOW() - INTERVAL '30 days'
        ) AS clicks_30d
      FROM advertisers a
      ORDER BY a.name ASC
    `) as unknown as AdvertiserWithStats[];
    return NextResponse.json({ advertisers: rows });
  } catch (err) {
    console.error('[admin/advertisers GET]', errMessage(err));
    return NextResponse.json({ error: 'list failed', detail: errMessage(err) }, { status: 500 });
  }
}

export const POST = withAdminTracking(async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    name?: string;
    contact_email?: string;
    requires_email_gate?: boolean;
    publication?: string | string[];
    status?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const name = (body.name || '').trim();
  if (!name) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }
  const contactEmail = (body.contact_email || '').trim() || null;
  const requiresGate = !!body.requires_email_gate;
  const publication = normalizePublication(body.publication);
  const status: 'prospect' | 'advertiser' | 'archived' =
    body.status === 'advertiser' || body.status === 'archived' ? body.status : 'prospect';

  try {
    await ensureSchema();
    await ensurePublicationColumn();
    const sql = getSql();

    const baseSlug = slugify(name) || `advertiser-${Date.now()}`;
    let slug = baseSlug;
    let suffix = 2;
    while (true) {
      const existing = (await sql`
        SELECT id FROM advertisers WHERE slug = ${slug} LIMIT 1
      `) as unknown as Array<{ id: number }>;
      if (existing.length === 0) break;
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
      if (suffix > 50) {
        return NextResponse.json({ error: 'could not allocate slug' }, { status: 500 });
      }
    }

    const shareToken = generateShareToken();
    const inserted = (await sql`
      INSERT INTO advertisers (
        name, slug, share_token, contact_email,
        requires_email_gate, publication, status, created_at, updated_at
      ) VALUES (
        ${name}, ${slug}, ${shareToken}, ${contactEmail},
        ${requiresGate}, ${publication}, ${status}, NOW(), NOW()
      )
      RETURNING *
    `) as unknown as Advertiser[];

    // Mirror the new advertiser into the Advertisers mailing segment
    // so they're immediately reachable from /admin/mailing. Best-effort.
    try {
      const newId = inserted[0]?.id;
      if (typeof newId === 'number') {
        await upsertAdvertiserMailingByAdvertiserId(newId);
      }
    } catch (err) {
      console.warn('[admin/advertisers POST] mailing upsert failed:', err);
    }

    return NextResponse.json({ advertiser: inserted[0] }, { status: 201 });
  } catch (err) {
    console.error('[admin/advertisers POST]', errMessage(err));
    return NextResponse.json({ error: 'create failed', detail: errMessage(err) }, { status: 500 });
  }
});
