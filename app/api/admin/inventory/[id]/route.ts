// app/api/admin/inventory/[id]/route.ts
//
// Admin endpoints for editing a single builder_inventory row.
// PATCH: partial update (status / featured / publication / edits).
// DELETE: hard delete (the row plus any thumbnail_jobs via CASCADE).
//
// Auth: inline check via /admin/auth/me — page layouts do not gate API
// routes (see Session 11 security hotfix). The verify call also returns
// admin email which we record as reviewed_by on status changes.

import { NextRequest, NextResponse } from 'next/server';
import {
  updateBuilderInventory,
  deleteBuilderInventory,
  type UpdateBuilderInventoryInput,
  type Publication,
  type PromoType,
  type Status,
} from '@/lib/builder-inventory';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.myrealtyline.com';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AdminInfo = { email: string; fullName: string };

async function fetchAdmin(cookieHeader: string | null): Promise<AdminInfo | null> {
  if (!cookieHeader) return null;
  try {
    const r = await fetch(`${API_URL}/admin/auth/me`, {
      method: 'GET',
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!r.ok) return null;
    const body = (await r.json()) as {
      admin?: { email?: string; fullName?: string };
    };
    if (!body.admin?.email) return null;
    return {
      email: body.admin.email,
      fullName: body.admin.fullName ?? body.admin.email,
    };
  } catch {
    return null;
  }
}

type Ctx = { params: Promise<{ id: string }> };

function parseId(idParam: string): number | null {
  const n = parseInt(idParam, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const VALID_STATUS: Status[] = ['pending', 'active', 'rejected'];
const VALID_PUBLICATION: Publication[] = ['realtyline', 'newsline', 'both'];
const VALID_PROMO: PromoType[] = ['rate_buydown', 'incentive', 'event', 'broker_bonus', 'other'];

function coerceNum(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function coerceStr(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

function coerceReqStr(v: unknown): string | undefined {
  if (v === undefined) return undefined;
  if (v === null) return undefined;
  const s = String(v).trim();
  return s.length === 0 ? undefined : s;
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const cookieHeader = req.headers.get('cookie');
  const admin = await fetchAdmin(cookieHeader);
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    );
  }

  const { id: idParam } = await ctx.params;
  const id = parseId(idParam);
  if (id == null) {
    return NextResponse.json({ ok: false, error: 'Invalid id' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: UpdateBuilderInventoryInput = {};

  if ('status' in body) {
    const s = body.status as string;
    if (!VALID_STATUS.includes(s as Status)) {
      return NextResponse.json({ ok: false, error: 'Invalid status' }, { status: 400 });
    }
    updates.status = s as Status;
  }

  if ('featured' in body) {
    if (typeof body.featured !== 'boolean') {
      return NextResponse.json({ ok: false, error: 'featured must be boolean' }, { status: 400 });
    }
    updates.featured = body.featured;
  }

  if ('publication' in body) {
    const p = body.publication as string;
    if (!VALID_PUBLICATION.includes(p as Publication)) {
      return NextResponse.json({ ok: false, error: 'Invalid publication' }, { status: 400 });
    }
    updates.publication = p as Publication;
  }

  // Required-string text fields (can't be null/empty)
  for (const key of ['builderName', 'title', 'city', 'state'] as const) {
    if (key in body) {
      const val = coerceReqStr(body[key]);
      if (val === undefined) {
        return NextResponse.json(
          { ok: false, error: `${key} cannot be empty` },
          { status: 400 },
        );
      }
      updates[key] = val;
    }
  }

  // Nullable string fields
  if ('description' in body) {
    updates.description = coerceStr(body.description) ?? null;
  }
  if ('expiresAt' in body) {
    updates.expiresAt = coerceStr(body.expiresAt) ?? null;
  }

  // Nullable numeric fields
  for (const key of [
    'bedsMin',
    'bedsMax',
    'bathsMin',
    'bathsMax',
    'sqftMin',
    'sqftMax',
    'priceMin',
    'priceMax',
  ] as const) {
    if (key in body) {
      const n = coerceNum(body[key]);
      if (n === undefined) continue;
      updates[key] = n;
    }
  }

  // Promo type (nullable enum)
  if ('promoType' in body) {
    if (body.promoType === null || body.promoType === '') {
      updates.promoType = null;
    } else {
      const p = body.promoType as string;
      if (!VALID_PROMO.includes(p as PromoType)) {
        return NextResponse.json(
          { ok: false, error: 'Invalid promoType' },
          { status: 400 },
        );
      }
      updates.promoType = p as PromoType;
    }
  }

  // Stamp reviewedBy if status is changing (the DB function decides reviewedAt).
  if (updates.status !== undefined) {
    updates.reviewedBy = admin.email;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: 'No updates provided' }, { status: 400 });
  }

  try {
    const updated = await updateBuilderInventory(id, updates);
    if (!updated) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, row: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[admin/inventory/${id} PATCH] error:`, msg);
    return NextResponse.json(
      { ok: false, error: 'Update failed' },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const cookieHeader = req.headers.get('cookie');
  const admin = await fetchAdmin(cookieHeader);
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    );
  }

  const { id: idParam } = await ctx.params;
  const id = parseId(idParam);
  if (id == null) {
    return NextResponse.json({ ok: false, error: 'Invalid id' }, { status: 400 });
  }

  try {
    const ok = await deleteBuilderInventory(id);
    if (!ok) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[admin/inventory/${id} DELETE] error:`, msg);
    return NextResponse.json(
      { ok: false, error: 'Delete failed' },
      { status: 500 },
    );
  }
}
