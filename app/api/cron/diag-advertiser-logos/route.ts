// app/api/cron/diag-advertiser-logos/route.ts
//
// TEMPORARY diagnostic endpoint. Called by the agent once with the
// CRON_SECRET to confirm the shape of the advertisers table for the
// logo-matching pass:
//   - How many advertisers total.
//   - How many have avatar_url AND website (the eligible set the logo
//     phash pass will match against).
//   - Sample of the eligible set with avatar_url values so we can
//     confirm the stored logos are actually reachable and not, e.g.,
//     wordmarks-only that phash would never match.
//
// This route is meant to be deleted immediately after use.

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const auth = req.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  return req.headers.get('x-vercel-cron') === '1';
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json({ ok: false, error: 'no DATABASE_URL' }, { status: 500 });
  }
  const sql = neon(dbUrl);

  const totalRows = (await sql`SELECT COUNT(*)::int AS n FROM advertisers`) as { n: number }[];
  const eligibleRows = (await sql`
    SELECT COUNT(*)::int AS n FROM advertisers
    WHERE avatar_url IS NOT NULL AND avatar_url <> ''
      AND website IS NOT NULL AND website <> ''
  `) as { n: number }[];
  const hasLogoRows = (await sql`
    SELECT COUNT(*)::int AS n FROM advertisers
    WHERE avatar_url IS NOT NULL AND avatar_url <> ''
  `) as { n: number }[];
  const hasWebsiteRows = (await sql`
    SELECT COUNT(*)::int AS n FROM advertisers
    WHERE website IS NOT NULL AND website <> ''
  `) as { n: number }[];

  const sample = (await sql`
    SELECT id, name, slug, avatar_url, website
    FROM advertisers
    WHERE avatar_url IS NOT NULL AND avatar_url <> ''
      AND website IS NOT NULL AND website <> ''
    ORDER BY id
    LIMIT 50
  `) as Array<{
    id: number;
    name: string;
    slug: string;
    avatar_url: string;
    website: string;
  }>;

  // Also grab the advertisers most likely to appear in the target
  // magazine (Stewart Title, KB Home, Independence Title, La Cima,
  // Austin Battle) so we can see whether they even have logos stored.
  const targets = (await sql`
    SELECT id, name, slug, avatar_url, website
    FROM advertisers
    WHERE lower(name) LIKE '%stewart%'
       OR lower(name) LIKE '%kb home%'
       OR lower(name) LIKE '%independence%'
       OR lower(name) LIKE '%la cima%'
       OR lower(name) LIKE '%austin battle%'
    ORDER BY name
  `) as Array<{
    id: number;
    name: string;
    slug: string;
    avatar_url: string | null;
    website: string | null;
  }>;

  return NextResponse.json({
    ok: true,
    counts: {
      total: totalRows[0]?.n ?? 0,
      has_logo: hasLogoRows[0]?.n ?? 0,
      has_website: hasWebsiteRows[0]?.n ?? 0,
      eligible: eligibleRows[0]?.n ?? 0,
    },
    sample,
    targets,
  });
}
