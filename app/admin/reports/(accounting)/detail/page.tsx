import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { getCheckPayments } from '@/lib/server/deposit-reports';
import DepositDetailClient from '@/app/admin/reports/_components/DepositDetailClient';

export const dynamic = 'force-dynamic';

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function normalizeDate(value: string | undefined, fallback: string): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

export default async function DepositDetailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let admin = null;
  try { admin = await getCurrentAdmin(); } catch { admin = null; }
  if (!admin) redirect('/admin/login');

  const params = await searchParams;
  const firstParam = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const from = normalizeDate(firstParam('from'), isoDate(monthStart));
  const to = normalizeDate(firstParam('to'), isoDate(today));
  const payments = await getCheckPayments(from, to);

  return (
    <DepositDetailClient
      payments={payments}
      from={from}
      to={to}
      preparedBy={admin.email ?? null}
    />
  );
}
