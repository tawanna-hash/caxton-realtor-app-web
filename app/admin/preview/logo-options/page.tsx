// app/admin/preview/logo-options/page.tsx
//
// Admin-only preview of multiple logo/header treatments for the public
// advertiser detail page. Loads a real advertiser (by slug, default
// 'champions-school-of-real-estate') and renders the same logo/identity
// data six different ways side-by-side so the user can pick a
// direction.
//
// Nothing here ships to the public site - this is a sandbox.

import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { getSql, ensureSchema } from '@/lib/db';
import type { Advertiser } from '@/lib/advertisers';
import LogoOptionsClient from './LogoOptionsClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type SearchParams = { slug?: string };

export default async function LogoOptionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin/login');

  const { slug = 'champions-school-of-real-estate' } = await searchParams;

  await ensureSchema();
  const sql = getSql();

  const rows = (await sql`
    SELECT * FROM advertisers WHERE slug = ${slug} LIMIT 1
  `) as unknown as Advertiser[];

  // Pull a couple more advertisers so the picker can switch between
  // them without round-tripping through a URL change.
  const picker = (await sql`
    SELECT id, slug, name, avatar_url
      FROM advertisers
     WHERE status = 'active'
     ORDER BY name ASC
     LIMIT 60
  `) as unknown as Array<{
    id: number;
    slug: string;
    name: string;
    avatar_url: string | null;
  }>;

  if (rows.length === 0) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold mb-2">Logo design options</h1>
        <p className="text-sm text-gray-600 mb-6">
          No advertiser found for slug{' '}
          <code className="px-1.5 py-0.5 bg-gray-100 rounded">{slug}</code>.
          Try one from the list below.
        </p>
        <ul className="text-sm space-y-1">
          {picker.map((p) => (
            <li key={p.id}>
              <a
                href={`/admin/preview/logo-options?slug=${encodeURIComponent(p.slug)}`}
                className="text-[#3D0740] hover:underline"
              >
                {p.name}
              </a>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  return <LogoOptionsClient advertiser={rows[0]} picker={picker} />;
}
