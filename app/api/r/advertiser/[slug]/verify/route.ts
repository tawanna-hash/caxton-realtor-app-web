// app/api/r/advertiser/[slug]/verify/route.ts
//
// GET /api/r/advertiser/<slug>/verify?g=<grant_token>
// → Validates the grant, marks it verified, extends expiry to 30 days,
//   sets an httpOnly cookie, redirects to the dashboard.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import {
  ensureGrantsSchema, grantCookieName, ACCESS_COOKIE_DAYS,
} from '@/lib/advertiser-grants';
import type { Advertiser } from '@/lib/advertisers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

type RouteCtx = { params: Promise<{ slug: string }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { slug } = await ctx.params;
  const url = new URL(req.url);
  const g = url.searchParams.get('g');
  if (!g) {
    return NextResponse.json({ error: 'missing grant token' }, { status: 400 });
  }

  try {
    await ensureSchema();
    await ensureGrantsSchema();
    const sql = getSql();

    const advRows = (await sql`
      SELECT id, name, slug, share_token, contact_email, requires_email_gate
      FROM advertisers WHERE slug = ${slug}
    `) as unknown as Advertiser[];
    if (advRows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    const advertiser = advRows[0];

    const grantRows = (await sql`
      SELECT id, expires_at, verified_at
      FROM advertiser_email_grants
      WHERE advertiser_id = ${advertiser.id} AND grant_token = ${g}
      LIMIT 1
    `) as unknown as Array<{
      id: number;
      expires_at: string;
      verified_at: string | null;
    }>;
    if (grantRows.length === 0) {
      return NextResponse.json({ error: 'invalid grant' }, { status: 401 });
    }
    const grant = grantRows[0];

    if (new Date(grant.expires_at) <= new Date()) {
      return NextResponse.json({ error: 'grant expired' }, { status: 401 });
    }

    const ip = req.headers.get('x-forwarded-for')
      || req.headers.get('x-real-ip')
      || null;
    const newExp = new Date(Date.now() + ACCESS_COOKIE_DAYS * 24 * 60 * 60 * 1000);

    if (!grant.verified_at) {
      await sql`
        UPDATE advertiser_email_grants
        SET verified_at = NOW(),
            used_at = NOW(),
            expires_at = ${newExp.toISOString()},
            ip_at_verify = ${ip}
        WHERE id = ${grant.id}
      `;
    } else {
      // Already verified; extend expiry on reuse (e.g. user clicks the same link again).
      await sql`
        UPDATE advertiser_email_grants
        SET used_at = NOW(),
            expires_at = ${newExp.toISOString()}
        WHERE id = ${grant.id}
      `;
    }

    const dashboardUrl = new URL(`/r/advertiser/${slug}`, req.url);
    const response = NextResponse.redirect(dashboardUrl, 302);
    response.cookies.set(grantCookieName(advertiser.id), g, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: ACCESS_COOKIE_DAYS * 24 * 60 * 60,
      path: '/',
    });
    return response;
  } catch (err) {
    console.error('[r/advertiser/:slug/verify]', errMessage(err));
    return NextResponse.json(
      { error: 'verify failed', detail: errMessage(err) },
      { status: 500 },
    );
  }
}
