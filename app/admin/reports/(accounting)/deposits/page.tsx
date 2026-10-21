import { redirect } from 'next/navigation';

// Moved to Reports (Beta). Keeps old links and the date range working.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams;
  const q = new URLSearchParams();
  for (const k of ['from', 'to']) { const v = Array.isArray(p[k]) ? p[k]![0] : (p[k] as string | undefined); if (v) q.set(k, v); }
  redirect(`/admin/reports-beta/deposit-slip${q.size ? `?${q}` : ''}`);
}
