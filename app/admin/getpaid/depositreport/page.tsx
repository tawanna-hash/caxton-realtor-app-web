// app/admin/getpaid/depositreport/page.tsx
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
import { ensureSchema, getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import DepositReportClient, { type DepositPaymentRow } from './DepositReportClient';

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

  await ensureSchema();
  const sql = getSql();

  const payments = await sql`
    SELECT
      p.id,
      to_char(p.payment_date, 'YYYY-MM-DD')   AS payment_date,
      p.amount_cents::int                     AS amount_cents,
      p.payment_method,
      p.reference,
      p.memo,
      p.source,
      p.created_by,
      p.created_at,
      i.id                                    AS invoice_id,
      i.number                                AS invoice_number,
      i.status                                AS invoice_status,
      i.total_cents::int                      AS invoice_total_cents,
      to_char(i.due_date, 'YYYY-MM-DD')       AS invoice_due_date,
      COALESCE(adv.name, i.bill_to_name)      AS partner_name,
      adv.publication                         AS publication
    FROM invoice_payments p
    JOIN invoices i        ON i.id = p.invoice_id
    LEFT JOIN advertisers adv ON adv.id = i.advertiser_id
    WHERE p.payment_date >= ${from}::date
      AND p.payment_date <= ${to}::date
      AND p.payment_method ILIKE 'check%'
    ORDER BY p.payment_date ASC, p.created_at ASC
  `.catch(() => [] as unknown[]);

  return (
    <DepositReportClient
      payments={payments as unknown as DepositPaymentRow[]}
      from={from}
      to={to}
      preparedBy={admin.email ?? null}
    />
  );
}
