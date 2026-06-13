// app/api/me/footer-context/route.ts
//
// GET - context for the FooterPickerSheet that opens when a visitor
// taps Download on a /resources calculator. Returns one of three roles:
//
//   role = "admin"     - admin staff (Tawanna / team). Includes the
//                        full advertisers list so they can stamp any
//                        client's brand on the download. No brand
//                        preloaded - the sheet shows a dropdown first.
//
//   role = "portal"    - signed-in broker/agent via magic link.
//                        Preloads their own brand + saved default
//                        footer template. (Same data /api/portal/me
//                        used to return.)
//
//   role = "anonymous" - no session at all. The sheet should NOT
//                        appear for these visitors - downloads just
//                        use the generic site footer.
//
// We deliberately put admin first so Tawanna's experience is correct
// even when she's also got a stale portal cookie.

import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import { coerceFooterTemplateId, type FooterBrand } from '@/lib/footer-templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface FooterContextAdvertiserOption {
  id: number;
  name: string;
}

export type FooterContextResponse =
  | {
      role: 'admin';
      advertisers: FooterContextAdvertiserOption[];
    }
  | {
      role: 'portal';
      advertiser_id: number;
      default_footer_template: string;
      brand: FooterBrand;
    }
  | { role: 'anonymous' };

export async function GET() {
  // 1) Admin?
  const admin = await getCurrentAdmin().catch(() => null);
  if (admin) {
    try {
      await ensureSchema();
      const sql = getSql();
      const rows = (await sql`
        SELECT id, name
        FROM advertisers
        WHERE COALESCE(status, 'active') != 'archived'
        ORDER BY name ASC
      `) as unknown as Array<{ id: number; name: string }>;
      const payload: FooterContextResponse = {
        role: 'admin',
        advertisers: rows,
      };
      return NextResponse.json(payload);
    } catch (err) {
      console.error('[me/footer-context] admin path failed:', err);
      // Fall through to anonymous - never block the admin from downloading.
      return NextResponse.json({ role: 'admin', advertisers: [] } satisfies FooterContextResponse);
    }
  }

  // 2) Portal user?
  const portal = await getCurrentPortalUser().catch(() => null);
  if (portal) {
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
          footer_template
        FROM advertisers
        WHERE id = ${portal.advertiser_id}
        LIMIT 1
      `) as unknown as Array<{
        name: string | null; company: string | null; title: string | null;
        portal_email: string | null; contact_email: string | null;
        phone: string | null; office_phone: string | null; website: string | null;
        avatar_url: string | null; tagline: string | null; license_number: string | null;
        address: string | null; address_2: string | null;
        city: string | null; state: string | null; zip: string | null;
        footer_template: string | null;
      }>;
      if (rows.length > 0) {
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
        };
        const payload: FooterContextResponse = {
          role: 'portal',
          advertiser_id: portal.advertiser_id,
          default_footer_template: coerceFooterTemplateId(r.footer_template),
          brand,
        };
        return NextResponse.json(payload);
      }
    } catch (err) {
      console.error('[me/footer-context] portal path failed:', err);
    }
  }

  // 3) Anonymous
  return NextResponse.json({ role: 'anonymous' } satisfies FooterContextResponse);
}
