// app/(public)/magazine/[id]/page.tsx
//
// Server component for share links: /magazine/{id}
// Fetches the magazine server-side, 404s if missing, otherwise renders the
// MagazineClient with initialMagazine so the reader opens directly to that
// issue. The page's <title> reflects the magazine for nicer link previews.

import { notFound } from 'next/navigation';
import { getSql } from '@/lib/db';
import type { Magazine } from '@/lib/magazines';
import MagazineClient from '../MagazineClient';
import { MagazineGA } from '@/components/MagazineGA';
import { getMeasurementId, type PublicationKey } from '@/lib/publication-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type PageProps = { params: Promise<{ id: string }> };

async function fetchMagazineById(id: number): Promise<Magazine | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, publication, year, month, issue_label,
           cover_url, reader_url, page_urls, page_count, sort_date
    FROM magazines
    WHERE id = ${id}
      AND page_count > 0
  `;
  return rows.length === 0 ? null : (rows[0] as unknown as Magazine);
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return { title: 'Magazine — Realty News Now' };
  }
  try {
    const mag = await fetchMagazineById(idNum);
    if (!mag) return { title: 'Magazine — Realty News Now' };
    return {
      title: `${mag.issue_label} — Realty News Now`,
      description: `Read ${mag.issue_label} from ${mag.publication === 'austin' ? 'RealtyLine' : 'Newsline San Antonio'}.`,
      openGraph: {
        title: mag.issue_label,
        description: `${mag.publication === 'austin' ? 'RealtyLine Austin' : 'Newsline San Antonio'} — ${mag.issue_label}`,
        images: mag.cover_url ? [{ url: mag.cover_url }] : undefined,
      },
    };
  } catch {
    return { title: 'Magazine — Realty News Now' };
  }
}

export default async function MagazineByIdPage({ params }: PageProps) {
  const { id } = await params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    notFound();
  }
  const mag = await fetchMagazineById(idNum);
  if (!mag) {
    notFound();
  }
  // Pick the GA4 Measurement ID for this issue's publication so the
  // reader fires page_view + page_flip events into the right property.
  const pubKey: PublicationKey = mag.publication === 'san_antonio' ? 'san_antonio' : 'austin';
  const measurementId = await getMeasurementId(pubKey);
  return (
    <>
      <MagazineGA measurementId={measurementId} />
      <MagazineClient initialMagazine={mag} />
    </>
  );
}
