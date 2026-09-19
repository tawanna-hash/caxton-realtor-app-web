// app/admin/magazines/[id]/page.tsx
//
// Server wrapper for editing a single magazine. Queries the DB directly
// (no self-fetch to /api/admin/magazines/[id]) because the self-fetch
// pattern fails on Vercel's runtime — VERCEL_URL is the deployment-
// specific hostname, not the production domain where the admin session
// cookie was set.

import { notFound } from 'next/navigation';
import MagazineEditForm from './MagazineEditForm';
import { getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin · Edit Magazine' };

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
  page_texts: string[] | null;
};

async function isAdmin(): Promise<boolean> {
  try {
    const admin = await getCurrentAdmin();
    return admin !== null;
  } catch {
    return false;
  }
}

async function fetchOne(id: string): Promise<Magazine | null> {
  if (!(await isAdmin())) return null;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) return null;
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT id, publication, year, month, issue_label,
             cover_url, reader_url, page_urls, page_count,
             to_char(sort_date, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS sort_date,
             page_texts
      FROM magazines
      WHERE id = ${numericId}
      LIMIT 1
    `) as Magazine[];
    return rows[0] ?? null;
  } catch (err) {
    console.error('[admin/magazines/[id] page] query failed:', err);
    return null;
  }
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const magazine = await fetchOne(id);
  if (!magazine) notFound();
  return <MagazineEditForm initial={magazine} />;
}
