// app/admin/advertisers/[id]/page.tsx
//
// Admin drill-down page for one advertiser. Server component handles
// auth + initial advertiser fetch; the client component pulls analytics
// data on mount and renders charts + tables.

import { redirect, notFound } from 'next/navigation';
import { ensureSchema, getSql } from '@/lib/db';
import type { Advertiser } from '@/lib/advertisers';
import AdvertiserAnalyticsClient from './AdvertiserAnalyticsClient';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin · Advertiser Analytics' };

async function isAdmin(): Promise<boolean> {
  try {
    const admin = await getCurrentAdmin();
    return admin !== null;
  } catch {
    return false;
  }
}

type PageProps = { params: Promise<{ id: string }> };

export default async function AdvertiserDetailPage({ params }: PageProps) {
  const { id } = await params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) notFound();
  if (!(await isAdmin())) {
    redirect('/admin/login');
  }

  await ensureSchema();
  const sql = getSql();

  const rows = (await sql`
    SELECT id, name, slug, share_token, contact_email,
           requires_email_gate, created_at, updated_at
    FROM advertisers WHERE id = ${idNum}
  `) as unknown as Advertiser[];

  if (rows.length === 0) notFound();

  return <AdvertiserAnalyticsClient advertiser={rows[0]} />;
}
