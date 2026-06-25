// app/api/portal/account/route.ts
//
// PATCH — let the advertiser update their own contact fields. Allow-list
// restricted to safe profile fields (no status / type / portal_email — those
// are admin-managed).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import { coerceFooterTemplateId } from '@/lib/footer-templates';
import { ApiError, withErrorHandling } from '@/lib/server/error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Allow-list of self-updatable fields. Each must be a nullable string.
const nullableString = z.string().max(500).nullable().optional();

const portalAccountPatchSchema = z.object({
  company: nullableString,
  phone: nullableString,
  office_phone: nullableString,
  website: nullableString,
  address: nullableString,
  address_2: nullableString,
  city: nullableString,
  state: nullableString,
  zip: nullableString,
  // footer_template gets normalized via coerceFooterTemplateId; accept any
  // input here and let the helper validate.
  footer_template: z.unknown().optional(),
}).strict();

export const PATCH = withErrorHandling(async (req: NextRequest) => {
  const user = await getCurrentPortalUser();
  if (!user) throw new ApiError(401, 'Unauthorized');

  const body = portalAccountPatchSchema.parse(await req.json());

  await ensureSchema();
  const sql = getSql();
  const updated: string[] = [];

  // Helper: coerce undefined-or-string to nullable string for SQL.
  const norm = (v: string | null | undefined): string | null =>
    typeof v === 'string' ? v : null;

  if ('company' in body)      { await sql`UPDATE advertisers SET company = ${norm(body.company)} WHERE id = ${user.advertiser_id}`;      updated.push('company'); }
  if ('phone' in body)        { await sql`UPDATE advertisers SET phone = ${norm(body.phone)} WHERE id = ${user.advertiser_id}`;        updated.push('phone'); }
  if ('office_phone' in body) { await sql`UPDATE advertisers SET office_phone = ${norm(body.office_phone)} WHERE id = ${user.advertiser_id}`; updated.push('office_phone'); }
  if ('website' in body)      { await sql`UPDATE advertisers SET website = ${norm(body.website)} WHERE id = ${user.advertiser_id}`;      updated.push('website'); }
  if ('address' in body)      { await sql`UPDATE advertisers SET address = ${norm(body.address)} WHERE id = ${user.advertiser_id}`;      updated.push('address'); }
  if ('address_2' in body)    { await sql`UPDATE advertisers SET address_2 = ${norm(body.address_2)} WHERE id = ${user.advertiser_id}`;    updated.push('address_2'); }
  if ('city' in body)         { await sql`UPDATE advertisers SET city = ${norm(body.city)} WHERE id = ${user.advertiser_id}`;         updated.push('city'); }
  if ('state' in body)        { await sql`UPDATE advertisers SET state = ${norm(body.state)} WHERE id = ${user.advertiser_id}`;        updated.push('state'); }
  if ('zip' in body)          { await sql`UPDATE advertisers SET zip = ${norm(body.zip)} WHERE id = ${user.advertiser_id}`;          updated.push('zip'); }
  if ('footer_template' in body) {
    const tpl = coerceFooterTemplateId(body.footer_template);
    await sql`UPDATE advertisers SET footer_template = ${tpl} WHERE id = ${user.advertiser_id}`;
    updated.push('footer_template');
  }

  if (updated.length === 0) {
    throw new ApiError(400, 'no updatable fields');
  }
  return NextResponse.json({ ok: true, updated_fields: updated });
});
