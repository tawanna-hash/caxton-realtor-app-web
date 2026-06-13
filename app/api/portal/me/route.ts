// app/api/portal/me/route.ts
//
// GET - read-only view of the signed-in advertiser's brand fields plus
// their default footer template. Used by the /resources calculator pages
// to autopopulate the footer-template picker when an agent/broker is
// signed in. Returns 401 (not redirect) when no session, so the client
// can swap in a "Sign in to add your brand footer" prompt without a
// full page navigation.
//
// We intentionally do NOT return staff / locations / additional_contacts
// here - the footer represents the brokerage signed into the portal,
// not the org chart underneath them.
//
// Shape mirrors lib/footer-templates.ts -> FooterBrand so the renderer
// can consume the payload directly.
//
// Cache: no - this is per-session and changes the moment a profile is
// edited. Force dynamic so Vercel never caches across sessions.
//
// Auth: getCurrentPortalUser() resolves the magic-link cookie.

import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import { coerceFooterTemplateId, type FooterBrand } from '@/lib/footer-templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface PortalMeResponse {
  signed_in: true;
  advertiser_id: number;
  default_footer_template: string;
  brand: FooterBrand;
}

export async function GET() {
  const user = await getCurrentPortalUser();
  if (!user) {
    return NextResponse.json({ signed_in: false }, { status: 401 });
  }

  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT
      name, company, title,
      portal_email, contact_email,
      phone, office_phone, website,
      avatar_url, tagline, license_number,
      address, address_2, city, state, zip,
      footer_template
    FROM advertisers
    WHERE id = ${user.advertiser_id}
    LIMIT 1
  `) as unknown as Array<{
    name: string | null;
    company: string | null;
    title: string | null;
    portal_email: string | null;
    contact_email: string | null;
    phone: string | null;
    office_phone: string | null;
    website: string | null;
    avatar_url: string | null;
    tagline: string | null;
    license_number: string | null;
    address: string | null;
    address_2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    footer_template: string | null;
  }>;
  if (rows.length === 0) {
    return NextResponse.json({ signed_in: false }, { status: 401 });
  }
  const row = rows[0];

  // For now treat avatar_url as both "logo" and "photo" - the calculator
  // PDF templates differ in placement (logo block vs signature block)
  // but most advertisers upload a single brand image. Future iterations
  // can split into logo_url / photo_url columns.
  const brand: FooterBrand = {
    name: row.name,
    company: row.company,
    title: row.title,
    email: row.portal_email ?? row.contact_email ?? null,
    phone: row.phone,
    office_phone: row.office_phone,
    website: row.website,
    logo_url: row.avatar_url,
    photo_url: row.avatar_url,
    address: row.address,
    address_2: row.address_2,
    city: row.city,
    state: row.state,
    zip: row.zip,
    license_number: row.license_number,
    tagline: row.tagline,
  };

  const payload: PortalMeResponse = {
    signed_in: true,
    advertiser_id: user.advertiser_id,
    default_footer_template: coerceFooterTemplateId(row.footer_template),
    brand,
  };
  return NextResponse.json(payload);
}
