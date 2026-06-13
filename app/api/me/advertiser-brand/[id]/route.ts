// app/api/me/advertiser-brand/[id]/route.ts
//
// GET - admin-only. Returns the brand fields for a given advertiser id
// in the same FooterBrand shape /api/portal/me returns, so the
// FooterPickerSheet can hand it straight to downloadCalcReport().
//
// Used by Tawanna / admin staff after they pick an advertiser from
// the dropdown in the picker sheet. Strict admin auth - 401 for
// anyone else.

import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { coerceFooterTemplateId, type FooterBrand } from '@/lib/footer-templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface AdvertiserBrandResponse {
  advertiser_id: number;
  default_footer_template: string;
  brand: FooterBrand;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getCurrentAdmin().catch(() => null);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const idNum = Number(id);
  if (!Number.isFinite(idNum) || idNum <= 0) {
    return NextResponse.json({ error: 'bad id' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT
        name, company, title,
        portal_email, contact_email,
        phone, office_phone, website,
        avatar_url, tagline, license_number,
        address, address_2, city, state, zip,
        footer_template, publication
      FROM advertisers
      WHERE id = ${idNum}
      LIMIT 1
    `) as unknown as Array<{
      name: string | null; company: string | null; title: string | null;
      portal_email: string | null; contact_email: string | null;
      phone: string | null; office_phone: string | null; website: string | null;
      avatar_url: string | null; tagline: string | null; license_number: string | null;
      address: string | null; address_2: string | null;
      city: string | null; state: string | null; zip: string | null;
      footer_template: string | null; publication: string | null;
    }>;
    if (rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    const r = rows[0];
    const brand: FooterBrand = {
      name: r.name,
      company: r.company,
      title: r.title,
      email: r.portal_email ?? r.contact_email ?? null,
      phone: r.phone,
      office_phone: r.office_phone,
      website: r.website,
      logo_url: r.avatar_url,
      photo_url: r.avatar_url,
      address: r.address,
      address_2: r.address_2,
      city: r.city,
      state: r.state,
      zip: r.zip,
      license_number: r.license_number,
      tagline: r.tagline,
      publication:
        r.publication === 'austin' || r.publication === 'san_antonio' || r.publication === 'both'
          ? r.publication
          : null,
    };
    const payload: AdvertiserBrandResponse = {
      advertiser_id: idNum,
      default_footer_template: coerceFooterTemplateId(r.footer_template),
      brand,
    };
    return NextResponse.json(payload);
  } catch (err) {
    console.error('[me/advertiser-brand GET] failed:', err);
    return NextResponse.json({ error: 'fetch failed' }, { status: 500 });
  }
}
