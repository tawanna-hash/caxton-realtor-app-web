import { ensureSchema, getSql } from '@/lib/db';

export interface DepositPaymentRow {
  id: string;
  payment_date: string | null;
  amount_cents: number;
  payment_method: string | null;
  reference: string | null;
  memo: string | null;
  source: string | null;
  created_by: string | null;
  created_at: string | null;
  invoice_id: string;
  invoice_number: string | null;
  invoice_status: string | null;
  invoice_total_cents: number | null;
  invoice_due_date: string | null;
  partner_name: string | null;
  publication: string | null;
}

/**
 * Canonical data source for check-based accounting reports. Both the deposit
 * summary and deposit detail pages consume these same recorded payment rows.
 */
export async function getCheckPayments(from: string, to: string): Promise<DepositPaymentRow[]> {
  await ensureSchema();
  const sql = getSql();

  const rows = await sql`
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
    JOIN invoices i           ON i.id = p.invoice_id
    LEFT JOIN advertisers adv ON adv.id = i.advertiser_id
    WHERE p.payment_date >= ${from}::date
      AND p.payment_date <= ${to}::date
      AND p.payment_method ILIKE 'check%'
    ORDER BY p.payment_date ASC, p.created_at ASC
  `.catch(() => [] as unknown[]);

  return rows as unknown as DepositPaymentRow[];
}
