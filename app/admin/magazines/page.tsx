// app/admin/magazines/page.tsx
//
// Admin magazines list page. Server component — fetches the list of all
// magazines (both publications) and hands it off to the client for
// rendering, deletion, and navigation to new/edit pages.
//
// Matches the pattern used by other admin pages (events, subscribers).

import { cookies } from 'next/headers';
import MagazinesAdminClient from './MagazinesAdminClient';

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

async function fetchMagazines(): Promise<Magazine[]> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  // Same-origin fetch — Next.js resolves this server-side.
  // We use a relative-style absolute URL constructed from the VERCEL_URL
  // env if available, or fall back to localhost (dev).
  const base =
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
  try {
    const r = await fetch(`${base}/api/admin/magazines`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!r.ok) return [];
    const data = await r.json();
    return data.magazines ?? [];
  } catch (err) {
    console.error('[admin/magazines page] fetch failed:', err);
    return [];
  }
}

export default async function Page() {
  const magazines = await fetchMagazines();
  return <MagazinesAdminClient initialMagazines={magazines} />;
}
