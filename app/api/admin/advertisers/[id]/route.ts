// app/api/admin/advertisers/[id]/route.ts
//
//   GET    — single advertiser
//   PATCH  — update name / contact_email / requires_email_gate / publication
//   DELETE — remove (hotspots' advertiser_id will be set NULL via FK)

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { slugify, type Advertiser } from '@/lib/advertisers';
import {
  ensurePublicationColumn, type Publication,
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

function normalizePublication(value: unknown): Publication | null {
  if (value === 'austin' || value === 'san_antonio' || value === 'both') return value;
  return null;
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  if (!(await isAdmin(req.headers.get('cookie')))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  try {
    await ensureSchema();
    await ensurePublicationColumn();
    const sql = getSql();
    const rows = (await sql`
      SELECT * FROM advertisers WHERE id = ${idNum}
    `) as unknown as Advertiser[];
    if (rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json({ advertiser: rows[0] });
  } catch (err) {
    console.error('[admin/advertisers GET id]', errMessage(err));
    return NextResponse.json({ error: 'get failed', detail: errMessage(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  if (!(await isAdmin(req.headers.get('cookie')))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  let body: {
    name?: string;
    contact_email?: string | null;
    requires_email_gate?: boolean;
    publication?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  try {
    await ensureSchema();
    await ensurePublicationColumn();
    const sql = getSql();

    const existing = (await sql`
      SELECT * FROM advertisers WHERE id = ${idNum}
    `) as unknown as Advertiser[];
    if (existing.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    const current = existing[0];

    const nextName = typeof body.name === 'string' && body.name.trim()
      ? body.name.trim()
      : current.name;

    let nextContactEmail: string | null = current.contact_email;
    if (body.contact_email !== undefined) {
      const trimmed = (body.contact_email || '').trim();
      nextContactEmail = trimmed || null;
    }

    const nextRequiresGate = typeof body.requires_email_gate === 'boolean'
      ? body.requires_email_gate
      : current.requires_email_gate;

    const normalizedPub = normalizePublication(body.publication);
    const nextPublication = normalizedPub ?? (current.publication || 'austin');

    let nextSlug = current.slug;
    if (nextName !== current.name) {
      const baseSlug = slugify(nextName) || `advertiser-${Date.now()}`;
      let candidate = baseSlug;
      let suffix = 2;
      while (true) {
        const conflict = (await sql`
          SELECT id FROM advertisers WHERE slug = ${candidate} AND id != ${idNum} LIMIT 1
        `) as unknown as Array<{ id: number }>;
        if (conflict.length === 0) break;
        candidate = `${baseSlug}-${suffix}`;
        suffix += 1;
        if (suffix > 50) {
          return NextResponse.json({ error: 'could not allocate slug' }, { status: 500 });
        }
      }
      nextSlug = candidate;
    }

    const updated = (await sql`
      UPDATE advertisers
      SET name = ${nextName},
          slug = ${nextSlug},
          contact_email = ${nextContactEmail},
          requires_email_gate = ${nextRequiresGate},
          publication = ${nextPublication},
          updated_at = NOW()
      WHERE id = ${idNum}
      RETURNING *
    `) as unknown as Advertiser[];

    return NextResponse.json({ advertiser: updated[0] });
  } catch (err) {
    console.error('[admin/advertisers PATCH]', errMessage(err));
    return NextResponse.json({ error: 'update failed', detail: errMessage(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  if (!(await isAdmin(req.headers.get('cookie')))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  try {
    await ensureSchema();
    const sql = getSql();
    const result = (await sql`
      DELETE FROM advertisers WHERE id = ${idNum} RETURNING id
    `) as unknown as Array<{ id: number }>;
    if (result.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/advertisers DELETE]', errMessage(err));
    return NextResponse.json({ error: 'delete failed', detail: errMessage(err) }, { status: 500 });
  }
}
