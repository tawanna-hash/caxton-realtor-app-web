// app/admin/magazines/page.tsx
//
// Admin magazines list page. Server component — queries the database
// directly and hands the result to the client component for rendering.
//
// Direct DB query (no self-fetch) — server-side fetch from a Next.js
// server component back to its own API route hangs on Vercel's runtime
// because the deployment-specific URL doesn't share the admin session
// cookie. Querying the DB directly is faster and more reliable.

import MagazinesAdminClient from './MagazinesAdminClient';
import { getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Admin · Magazines' };

type Magazine = {
  id: number;
  publication: 'austin' | 'san_antonio' | 'houston' | 'dallas';
  year: number;
  month: number;
  issue_label: string;
  cover_url: string | null;
  reader_url: string | null;
  page_urls: string[] | null;
  page_count: number;
  sort_date: string;
  gif_full_url: string | null;
  gif_teaser_url: string | null;
  gif_pingpong_url: string | null;
};

async function isAdmin(): Promise<boolean> {
  try {
    const admin = await getCurrentAdmin();
    return admin !== null;
  } catch {
    return false;
  }
}

async function fetchMagazines(): Promise<Magazine[]> {
  if (!(await isAdmin())) return [];
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT id, publication, year, month, issue_label,
             cover_url, reader_url, page_urls, page_count,
             to_char(sort_date, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS sort_date,
             gif_full_url, gif_teaser_url, gif_pingpong_url
      FROM magazines
      ORDER BY sort_date DESC NULLS LAST, id DESC
    `) as Magazine[];
    return rows;
  } catch (err) {
    console.error('[admin/magazines page] query failed:', err);
    return [];
  }
}

export default async function Page() {
  const magazines = await fetchMagazines();
  return <MagazinesAdminClient initialMagazines={magazines} />;
}
