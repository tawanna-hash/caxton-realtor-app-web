// app/api/admin/advertisers/route.ts
//
// GET  /api/admin/advertisers           → list all advertisers + computed stats
// POST /api/admin/advertisers           → create a new advertiser

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { slugify, generateShareToken } from '@/lib/advertisers';
import type { Advertiser, AdvertiserWithStats } from '@/lib/advertisers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.myrealtyline.com';

async function isAdmin(cookieHeader: string | null): Promise<boolean> {
  if (!cookieHeader) return false;
  try {
    const r = await fetch(`${API_URL}/admin/auth/me`, {
      method: 'GET', headers: { cookie: cookieHeader }, cache: 'no-store',
    });
    return r.ok;
  } catch { return false; }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export async function GET(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie');
  if (!(await isAdmin(cookieHeader))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await ensureSchema();
    const sql = getSql();

    const rows = (await sql`
      SELECT
        a.id, a.name, a.slug, a.share_token, a.contact_email,
        a.requires_email_gate, a.created_at, a.updated_at,
        (SELECT COUNT(*) FROM magazine_hotspots h WHERE h.advertiser_id = a.id) AS hotspot_count,
        (SELECT COUNT(*) FROM magazine_hotspot_clicks c
           JOIN magazine_hotspots h ON c.hotspot_id = h.id
          WHERE h.advertiser_id = a.id
            AND c.occurred_at > NOW() - INTERVAL '30 days') AS clicks_30d
      FROM advertisers a
      ORDER BY a.name ASC
    `) as unknown as AdvertiserWithStats[];

    return NextResponse.json({ advertisers: rows });
  } catch (err) {
    console.error('[admin/advertisers] GET failed:', errMessage(err));
    return NextResponse.json(
      { error: 'db error', detail: errMessage(err) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie');
  if (!(await isAdmin(cookieHeader))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { name?: string; contact_email?: string; requires_email_gate?: boolean };
  try { body = await req.json(); }
  catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const name = String(body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const contactEmail = body.contact_email ? String(body.contact_email).trim() : null;
  const requiresEmailGate = Boolean(body.requires_email_gate);

  try {
    await ensureSchema();
    const sql = getSql();

    // Find a unique slug. Append -2, -3, ... if base slug is taken.
    const baseSlug = slugify(name);
    if (!baseSlug) {
      return NextResponse.json({ error: 'name produces empty slug' }, { status: 400 });
    }

    let slug = baseSlug;
    let n = 1;
    while (true) {
      const dup = await sql`SELECT id FROM advertisers WHERE slug = ${slug} LIMIT 1`;
      if (dup.length === 0) break;
      n++;
      slug = `${baseSlug}-${n}`;
      if (n > 100) {
        return NextResponse.json({ error: 'could not generate unique slug' }, { status: 500 });
      }
    }

    const token = generateShareToken();

    const inserted = (await sql`
      INSERT INTO advertisers (name, slug, share_token, contact_email, requires_email_gate)
      VALUES (${name}, ${slug}, ${token}, ${contactEmail}, ${requiresEmailGate})
      RETURNING id, name, slug, share_token, contact_email,
                requires_email_gate, created_at, updated_at
    `) as unknown as Advertiser[];

    return NextResponse.json({ advertiser: inserted[0] }, { status: 201 });
  } catch (err) {
    console.error('[admin/advertisers] POST failed:', errMessage(err));
    return NextResponse.json(
      { error: 'create failed', detail: errMessage(err) },
      { status: 500 },
    );
  }
}
