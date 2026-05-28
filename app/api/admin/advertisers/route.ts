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
  type Publication,
} from '@/lib/publication-theme';
import { getServerApiBase } from '@/lib/server-api-base';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function isAdmin(cookieHeader: string | null): Promise<boolean> {
  if (!cookieHeader) return false;
  try {
    const API_URL = await getServerApiBase();
    const r = await fetch(`${API_URL}/admin/auth/me`, {
      method: 'GET',
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    return r.ok;
  } catch {
    return false;
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

function normalizePublication(value: unknown): Publication {
  if (value === 'san_antonio' || value === 'both') return value;
  return 'austin';
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin(req.headers.get('cookie')))) {
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

export async function POST(req: NextRequest) {
  if (!(await isAdmin(req.headers.get('cookie')))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    name?: string;
    contact_email?: string;
    requires_email_gate?: boolean;
    publication?: string;
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
        requires_email_gate, publication, created_at, updated_at
      ) VALUES (
        ${name}, ${slug}, ${shareToken}, ${contactEmail},
        ${requiresGate}, ${publication}, NOW(), NOW()
      )
      RETURNING *
    `) as unknown as Advertiser[];

    return NextResponse.json({ advertiser: inserted[0] }, { status: 201 });
  } catch (err) {
    console.error('[admin/advertisers POST]', errMessage(err));
    return NextResponse.json({ error: 'create failed', detail: errMessage(err) }, { status: 500 });
  }
}
