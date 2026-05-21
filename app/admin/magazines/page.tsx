// app/admin/magazines/page.tsx
//
// Admin magazines list page. Server component — queries the database
// directly and hands the result to the client component for rendering.
//
// Direct DB query (no self-fetch) — server-side fetch from a Next.js
// server component back to its own API route hangs on Vercel's runtime
// because the deployment-specific URL doesn't share the admin session
// cookie. Querying the DB directly is faster and more reliable.

import { cookies } from 'next/headers';
import MagazinesAdminClient from './MagazinesAdminClient';
import { getSql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Admin · Magazines' };

type Magazine = {
  id: number;
  publication: 'austin' | 'san_antonio';
  year: number;
  month: number;
  issue_label: string;
  cover_url: string | null;
  reader_url: string | null;
  page_urls: string[] | null;
  page_count: number;
  sort_date: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.myrealtyline.com';

async function isAdmin(cookieHeader: string): Promise<boolean> {
  try {
    const r = await fetch(`${API_URL}/admin/auth/me`, {
      method: 'GET',
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function fetchMagazines(): Promise<Magazine[]> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  if (!cookieHeader) return [];
  if (!(await isAdmin(cookieHeader))) return [];
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT id, publication, year, month, issue_label,
             cover_url, reader_url, page_urls, page_count, sort_date
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
