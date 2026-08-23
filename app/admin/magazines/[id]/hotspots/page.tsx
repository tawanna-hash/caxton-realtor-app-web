// app/admin/magazines/[id]/hotspots/page.tsx
//
// Admin hotspot editor route. Server component fetches the magazine,
// its hotspots, and a list of previous issues for "Copy from previous".
// Auth-gates via the existing /admin/auth/me pattern.
//
// Renders the HotspotsAdminClient with all initial state hydrated, so
// the editor opens instantly with no client-side loading flicker.

import { redirect, notFound } from 'next/navigation';
import { getSql, ensureSchema } from '@/lib/db';
import type { Magazine } from '@/lib/magazines';
import type { Hotspot } from '@/lib/hotspots';
import HotspotsAdminClient from './HotspotsAdminClient';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin · Hotspot Editor' };

async function isAdmin(): Promise<boolean> {
  try {
    const admin = await getCurrentAdmin();
    return admin !== null;
  } catch {
    return false;
  }
}

type PrevIssue = {
  id: number;
  publication: 'austin' | 'san_antonio';
  issue_label: string;
  hotspot_count: number;
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) notFound();
  if (!(await isAdmin())) {
    redirect('/admin/login');
  }

  await ensureSchema();
  const sql = getSql();

  // 1. Fetch the magazine.
  const mags = (await sql`
    SELECT id, publication, year, month, issue_label,
           cover_url, reader_url, page_urls, page_count,
           to_char(sort_date, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS sort_date
    FROM magazines
    WHERE id = ${idNum}
  `) as unknown as Magazine[];
  if (mags.length === 0) notFound();
  const magazine = mags[0];

  // 2. Fetch all hotspots (drafts + published) for this magazine.
  const hotspots = (await sql`
    SELECT id, magazine_id, page_idx,
           x_frac, y_frac, w_frac, h_frac,
           type, config, label, advertiser_name,
           is_published, source, created_by, created_at, updated_by, updated_at
    FROM magazine_hotspots
    WHERE magazine_id = ${idNum}
    ORDER BY page_idx, z_index, id
  `) as unknown as Hotspot[];

  // 3. Fetch up to 12 previous issues of the same publication that have
  //    hotspots, for the "Copy from previous issue" dropdown.
  const prevIssues = (await sql`
    SELECT m.id, m.publication, m.issue_label,
           COUNT(h.id)::int AS hotspot_count
    FROM magazines m
    LEFT JOIN magazine_hotspots h ON h.magazine_id = m.id
    WHERE m.publication = ${magazine.publication}
      AND m.id != ${idNum}
    GROUP BY m.id, m.publication, m.issue_label, m.sort_date
    HAVING COUNT(h.id) > 0
    ORDER BY m.sort_date DESC NULLS LAST, m.id DESC
    LIMIT 12
  `) as unknown as PrevIssue[];

  return (
    <HotspotsAdminClient
      magazine={magazine}
      initialHotspots={hotspots}
      prevIssues={prevIssues}
    />
  );
}
