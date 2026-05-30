// app/api/admin/mailing/route.ts
//
// GET  /api/admin/mailing?segment=advertisers&search=&sort=&dir=&limit=&offset=
//   List rows + total + segment counts
// POST /api/admin/mailing
//   Create a single row (admin manual add). Body fields match MailingContactInput.

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import {
  countBySegment,
  createMailingContact,
  isMailingSegment,
  isSortableColumn,
  listMailingContacts,
  segmentFromSlug,
  type MailingSegment,
} from '@/lib/mailing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

function resolveSegment(raw: string | null): MailingSegment | null {
  if (!raw) return null;
  if (isMailingSegment(raw)) return raw;
  return segmentFromSlug(raw);
}

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await ensureSchema();
    const url = new URL(req.url);
    const segment = resolveSegment(url.searchParams.get('segment'));
    if (!segment) {
      return NextResponse.json({ error: 'segment required' }, { status: 400 });
    }
    const search = url.searchParams.get('search') ?? undefined;
    const sortRaw = url.searchParams.get('sort');
    const sort = isSortableColumn(sortRaw) ? sortRaw : undefined;
    const dir = url.searchParams.get('dir') === 'asc' ? 'asc' : 'desc';
    const limit = Number(url.searchParams.get('limit') ?? '100');
    const offset = Number(url.searchParams.get('offset') ?? '0');

    const { rows, total } = await listMailingContacts({
      segment,
      search,
      sort,
      dir,
      limit: Number.isFinite(limit) ? limit : 100,
      offset: Number.isFinite(offset) ? offset : 0,
    });
    const counts = await countBySegment();
    return NextResponse.json({ rows, total, counts });
  } catch (err) {
    console.error('[admin/mailing GET]', errMessage(err));
    return NextResponse.json({ error: 'list failed', detail: errMessage(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const segmentRaw = typeof body.segment === 'string' ? body.segment : null;
    const segment = resolveSegment(segmentRaw);
    if (!segment) {
      return NextResponse.json({ error: 'invalid segment' }, { status: 400 });
    }
    const tags = Array.isArray(body.tags) ? (body.tags as unknown[]).filter((t): t is string => typeof t === 'string') : undefined;
    const row = await createMailingContact({
      segment,
      first_name:     typeof body.first_name     === 'string' ? body.first_name     : null,
      last_name:      typeof body.last_name      === 'string' ? body.last_name      : null,
      email:          typeof body.email          === 'string' ? body.email          : null,
      phone:          typeof body.phone          === 'string' ? body.phone          : null,
      company:        typeof body.company        === 'string' ? body.company        : null,
      title:          typeof body.title          === 'string' ? body.title          : null,
      license_number: typeof body.license_number === 'string' ? body.license_number : null,
      address:        typeof body.address        === 'string' ? body.address        : null,
      address_2:      typeof body.address_2      === 'string' ? body.address_2      : null,
      city:           typeof body.city           === 'string' ? body.city           : null,
      state:          typeof body.state          === 'string' ? body.state          : null,
      zip:            typeof body.zip            === 'string' ? body.zip            : null,
      website:        typeof body.website        === 'string' ? body.website        : null,
      notes:          typeof body.notes          === 'string' ? body.notes          : null,
      source:         typeof body.source         === 'string' ? body.source         : 'manual',
      advertiser_id:  typeof body.advertiser_id  === 'number' ? body.advertiser_id  : null,
      tags,
    });
    return NextResponse.json({ row });
  } catch (err) {
    console.error('[admin/mailing POST]', errMessage(err));
    return NextResponse.json({ error: 'create failed', detail: errMessage(err) }, { status: 500 });
  }
}
