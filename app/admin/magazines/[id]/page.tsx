// app/admin/magazines/[id]/page.tsx
//
// Server wrapper for editing a single magazine. Fetches the current row,
// passes it to the client edit form.

import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import MagazineEditForm from './MagazineEditForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin · Edit Magazine' };

async function fetchOne(id: string) {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';
  const r = await fetch(`${base}/api/admin/magazines/${id}`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });
  if (!r.ok) return null;
  const data = await r.json();
  return data.magazine ?? null;
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const magazine = await fetchOne(id);
  if (!magazine) notFound();
  return <MagazineEditForm initial={magazine} />;
}
