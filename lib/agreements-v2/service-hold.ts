// lib/agreements-v2/service-hold.ts
//
// e-Blast, app and other digital services are not scheduled until payment is
// received. "Received" means any of: the card was charged (paid_at), a paid
// invoice exists for the agreement, or an admin released the hold (check
// received, ACH cleared, or a deliberate override). Print is invoiced net 20
// and is never held.

import type { getSql } from '@/lib/db';

type Sql = ReturnType<typeof getSql>;

export const SERVICE_PAYMENT_RELEASED_EVENT = 'service_payment_released';

export type ServiceHold = { applies: boolean; held: boolean; reason: string };

export async function getServiceHold(sql: Sql, agreementId: string): Promise<ServiceHold | null> {
  const rows = (await sql`
    SELECT
      ag.signed_at IS NOT NULL AS signed,
      ag.status,
      (COALESCE(ag.channel, CASE WHEN ag.type IN ('print_ad', 'package') THEN 'print' ELSE 'digital' END) <> 'print'
        OR EXISTS (SELECT 1 FROM agreement_line_items li WHERE li.agreement_id = ag.id AND li.channel <> 'print')) AS digital,
      (ag.paid_at IS NOT NULL
        OR EXISTS (SELECT 1 FROM invoices i WHERE i.agreement_id = ag.id AND i.status = 'paid')
        OR COALESCE(ag.audit_log, '[]'::jsonb) @> ${JSON.stringify([{ event: SERVICE_PAYMENT_RELEASED_EVENT }])}::jsonb) AS received
    FROM agreements ag WHERE ag.id = ${agreementId}
  `) as unknown as Array<{ signed: boolean; status: string | null; digital: boolean; received: boolean }>;
  const r = rows[0];
  if (!r) return null;
  if (!r.digital) return { applies: false, held: false, reason: 'Print is invoiced, due within 20 days.' };
  if (r.received) return { applies: true, held: false, reason: 'Payment received.' };
  return { applies: true, held: true, reason: 'Services are on hold until payment is received.' };
}
