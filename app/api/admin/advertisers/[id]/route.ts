// app/api/admin/advertisers/[id]/route.ts
//
// GET    /api/admin/advertisers/:id    → fetch one
// PATCH  /api/admin/advertisers/:id    → update (name / contact_email / requires_email_gate)
// DELETE /api/admin/advertisers/:id    → delete (associated hotspots' advertiser_id set NULL via FK)

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { slugify } from '@/lib/advertisers';
import type { Advertiser } from '@/lib/advertisers';

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

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const cookieHeader = req.headers.get('cookie');
  if (!(await isAdmin(cookieHeader))) {
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
    const rows = (await sql`
      SELECT id, name, slug, share_token, contact_email,
             requires_email_gate, created_at, updated_at
      FROM advertisers
      WHERE id = ${idNum}
    `) as unknown as Advertiser[];
    if (rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json({ advertiser: rows[0] });
  } catch (err) {
    console.error('[admin/advertisers/:id] GET failed:', errMessage(err));
    return NextResponse.json({ error: 'db error', detail: errMessage(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const cookieHeader = req.headers.get('cookie');
  if (!(await isAdmin(cookieHeader))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  let body: { name?: string; contact_email?: string | null; requires_email_gate?: boolean };
  try { body = await req.json(); }
  catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();

    const existing = (await sql`
      SELECT id, name, slug FROM advertisers WHERE id = ${idNum}
    `) as unknown as { id: number; name: string; slug: string }[];
    if (existing.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    // Build SET clause dynamically. We're allowed to update name, contact_email,
    // requires_email_gate. Slug is recomputed if name changed (with collision suffix).
    let newName: string | null = null;
    if (typeof body.name === 'string') {
      const trimmed = body.name.trim();
      if (!trimmed) {
        return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
      }
      newName = trimmed;
    }

    let newSlug: string | null = null;
    if (newName && newName !== existing[0].name) {
      const baseSlug = slugify(newName);
      if (!baseSlug) {
        return NextResponse.json({ error: 'name produces empty slug' }, { status: 400 });
      }
      newSlug = baseSlug;
      let n = 1;
      while (true) {
        const dup = await sql`
          SELECT id FROM advertisers WHERE slug = ${newSlug} AND id <> ${idNum} LIMIT 1
        `;
        if (dup.length === 0) break;
        n++;
        newSlug = `${baseSlug}-${n}`;
        if (n > 100) {
          return NextResponse.json({ error: 'could not generate unique slug' }, { status: 500 });
        }
      }
    }

    const newContactEmail = body.contact_email === undefined
      ? undefined
      : (body.contact_email === null ? null : String(body.contact_email).trim() || null);
    const newRequiresEmailGate = typeof body.requires_email_gate === 'boolean'
      ? body.requires_email_gate
      : undefined;

    // Apply updates one column at a time. Cleaner than building dynamic SQL.
    if (newName !== null) {
      await sql`UPDATE advertisers SET name = ${newName}, updated_at = NOW() WHERE id = ${idNum}`;
    }
    if (newSlug !== null) {
      await sql`UPDATE advertisers SET slug = ${newSlug}, updated_at = NOW() WHERE id = ${idNum}`;
    }
    if (newContactEmail !== undefined) {
      await sql`UPDATE advertisers SET contact_email = ${newContactEmail}, updated_at = NOW() WHERE id = ${idNum}`;
    }
    if (newRequiresEmailGate !== undefined) {
      await sql`UPDATE advertisers SET requires_email_gate = ${newRequiresEmailGate}, updated_at = NOW() WHERE id = ${idNum}`;
    }

    const updated = (await sql`
      SELECT id, name, slug, share_token, contact_email,
             requires_email_gate, created_at, updated_at
      FROM advertisers WHERE id = ${idNum}
    `) as unknown as Advertiser[];

    return NextResponse.json({ advertiser: updated[0] });
  } catch (err) {
    console.error('[admin/advertisers/:id] PATCH failed:', errMessage(err));
    return NextResponse.json({ error: 'update failed', detail: errMessage(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const cookieHeader = req.headers.get('cookie');
  if (!(await isAdmin(cookieHeader))) {
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

    // FK has ON DELETE SET NULL — hotspots aren't removed, just unlinked.
    const result = await sql`DELETE FROM advertisers WHERE id = ${idNum} RETURNING id`;
    if ((result as unknown as { id: number }[]).length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('[admin/advertisers/:id] DELETE failed:', errMessage(err));
    return NextResponse.json({ error: 'delete failed', detail: errMessage(err) }, { status: 500 });
  }
}
