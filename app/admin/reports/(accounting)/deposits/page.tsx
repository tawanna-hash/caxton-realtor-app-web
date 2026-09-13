// app/admin/reports/(accounting)/deposits/page.tsx
//
// Check deposit report. Reads the same `invoice_payments` rows the AR dashboard
// and invoice drawer record against, joined to their invoice and partner, so a
// bank deposit slip can be reconciled against recorded receipts without
// retyping anything.
//
// Scope is checks only: cash, ACH and card receipts never reach a deposit slip,
// so they are excluded at the query. Correct a mistyped tender from the payment
// history in the invoice drawer and the receipt appears here.

import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { getCheckPayments } from '@/lib/server/deposit-reports';
import DepositReportClient from '@/app/admin/reports/_components/DepositReportClient';

export const dynamic = 'force-dynamic';

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function normalizeDate(value: string | undefined, fallback: string): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

export default async function DepositReportPage({
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
    <DepositReportClient
      payments={payments}
      from={from}
      to={to}
      preparedBy={admin.email ?? null}
    />
  );
}
