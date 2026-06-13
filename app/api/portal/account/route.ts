// app/api/portal/account/route.ts
//
// PATCH — let the advertiser update their own contact fields. Allow-list
// restricted to safe profile fields (no status / type / portal_email — those
// are admin-managed).

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import { coerceFooterTemplateId } from '@/lib/footer-templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SELF_UPDATABLE = ['company', 'phone', 'office_phone', 'website',
  'address', 'address_2', 'city', 'state', 'zip',
  'footer_template'] as const;

export async function PATCH(req: NextRequest) {
  const user = await getCurrentPortalUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();
    const updated: string[] = [];

    for (const field of SELF_UPDATABLE) {
      if (!(field in body)) continue;
      const raw = body[field as keyof typeof body];
      const v = typeof raw === 'string' ? raw : null;
      switch (field) {
        case 'company':      await sql`UPDATE advertisers SET company = ${v} WHERE id = ${user.advertiser_id}`; break;
        case 'phone':        await sql`UPDATE advertisers SET phone = ${v} WHERE id = ${user.advertiser_id}`; break;
        case 'office_phone': await sql`UPDATE advertisers SET office_phone = ${v} WHERE id = ${user.advertiser_id}`; break;
        case 'website':      await sql`UPDATE advertisers SET website = ${v} WHERE id = ${user.advertiser_id}`; break;
        case 'address':      await sql`UPDATE advertisers SET address = ${v} WHERE id = ${user.advertiser_id}`; break;
        case 'address_2':    await sql`UPDATE advertisers SET address_2 = ${v} WHERE id = ${user.advertiser_id}`; break;
        case 'city':         await sql`UPDATE advertisers SET city = ${v} WHERE id = ${user.advertiser_id}`; break;
        case 'state':        await sql`UPDATE advertisers SET state = ${v} WHERE id = ${user.advertiser_id}`; break;
        case 'zip':          await sql`UPDATE advertisers SET zip = ${v} WHERE id = ${user.advertiser_id}`; break;
        case 'footer_template': {
          const tpl = coerceFooterTemplateId(v);
          await sql`UPDATE advertisers SET footer_template = ${tpl} WHERE id = ${user.advertiser_id}`;
          break;
        }
      }
      updated.push(field);
    }

    if (updated.length === 0) {
      return NextResponse.json({ error: 'no updatable fields' }, { status: 400 });
    }
    return NextResponse.json({ ok: true, updated_fields: updated });
  } catch (err) {
    return NextResponse.json({ error: 'patch failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}
