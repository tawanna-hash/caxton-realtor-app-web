// app/api/admin/invoices/route.ts
//
// GET  — list all invoices (optionally filter by advertiser_id or agreement_id)
// POST — create a new invoice (auto-numbered per publication)

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import {
  INVOICE_STATUS_VALUES,
  isIsoCalendarDate,
  isSafeCents,
  lineItemsTotal,
  type InvoiceLineItem,
  type InvoiceWithAdvertiser,
} from '@/lib/invoices';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { captureServerEvent, flushServerEvents } from '@/lib/server/posthog';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { revalidateInvoiceViews } from '@/lib/server/revalidate-invoice-views';
import { withNeonTransaction } from '@/lib/server/db/neon';
import { nextDocumentNumber } from '@/lib/server/invoice-lifecycle';
import {
  appendInvoiceAudit,
  autoChargeInvoice,
  resolveCardOnFile,
  type ResolvedCardOnFile,
} from '@/lib/server/invoice-auto-charge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

function addCalendarDays(isoDate: string, days: number): string | null {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const advertiserParam = searchParams.get('advertiser_id');
  const agreementParam  = searchParams.get('agreement_id');
  const advertiserId = advertiserParam && Number.isInteger(+advertiserParam) ? +advertiserParam : null;
  const agreementId  = agreementParam || null;

  try {
    await ensureSchema();
    const sql = getSql();
    if (searchParams.get('next_number') === '1') {
      const rows = await sql`
        SELECT (
          GREATEST(
            COALESCE(MAX(
              CASE
                WHEN number ~ '^INV #[0-9]+$' THEN substring(number from '[0-9]+')::bigint
                WHEN number ~ '^[0-9]+$' THEN number::bigint
                ELSE NULL
              END
            ), 0),
            16200
          ) + 1
        )::text AS next_sequence
        FROM invoices
      ` as unknown as Array<{ next_sequence: string }>;
      return NextResponse.json({ next_number: `INV #${rows[0]?.next_sequence ?? '16201'}` });
    }
    let rows: unknown[];
    if (advertiserId !== null) {
      rows = await sql`
        SELECT i.*, adv.name AS advertiser_name,
          COALESCE(pay.amount_paid_cents, CASE WHEN i.status = 'paid' THEN i.total_cents ELSE 0 END)::int AS amount_paid_cents,
          GREATEST(i.total_cents - COALESCE(pay.amount_paid_cents, CASE WHEN i.status = 'paid' THEN i.total_cents ELSE 0 END), 0)::int AS balance_cents,
          COALESCE(pay.payments, '[]'::jsonb) AS payments,
          (i.status NOT IN ('paid','void','draft') AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE) AS is_overdue
        FROM invoices i
        LEFT JOIN advertisers adv ON adv.id = i.advertiser_id
        LEFT JOIN LATERAL (
          SELECT sum(p.amount_cents)::int AS amount_paid_cents,
            jsonb_agg(to_jsonb(p) ORDER BY p.payment_date, p.created_at) AS payments
          FROM invoice_payments p WHERE p.invoice_id = i.id
        ) pay ON true
        WHERE i.advertiser_id = ${advertiserId}
        ORDER BY i.created_at DESC
      `;
    } else if (agreementId) {
      rows = await sql`
        SELECT i.*, adv.name AS advertiser_name,
          COALESCE(pay.amount_paid_cents, CASE WHEN i.status = 'paid' THEN i.total_cents ELSE 0 END)::int AS amount_paid_cents,
          GREATEST(i.total_cents - COALESCE(pay.amount_paid_cents, CASE WHEN i.status = 'paid' THEN i.total_cents ELSE 0 END), 0)::int AS balance_cents,
          COALESCE(pay.payments, '[]'::jsonb) AS payments,
          (i.status NOT IN ('paid','void','draft') AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE) AS is_overdue
        FROM invoices i
        LEFT JOIN advertisers adv ON adv.id = i.advertiser_id
        LEFT JOIN LATERAL (
          SELECT sum(p.amount_cents)::int AS amount_paid_cents,
            jsonb_agg(to_jsonb(p) ORDER BY p.payment_date, p.created_at) AS payments
          FROM invoice_payments p WHERE p.invoice_id = i.id
        ) pay ON true
        WHERE i.agreement_id = ${agreementId}
        ORDER BY i.created_at DESC
      `;
    } else {
      rows = await sql`
        SELECT i.*, adv.name AS advertiser_name,
          COALESCE(pay.amount_paid_cents, CASE WHEN i.status = 'paid' THEN i.total_cents ELSE 0 END)::int AS amount_paid_cents,
          GREATEST(i.total_cents - COALESCE(pay.amount_paid_cents, CASE WHEN i.status = 'paid' THEN i.total_cents ELSE 0 END), 0)::int AS balance_cents,
          COALESCE(pay.payments, '[]'::jsonb) AS payments,
          (i.status NOT IN ('paid','void','draft') AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE) AS is_overdue
        FROM invoices i
        LEFT JOIN advertisers adv ON adv.id = i.advertiser_id
        LEFT JOIN LATERAL (
          SELECT sum(p.amount_cents)::int AS amount_paid_cents,
            jsonb_agg(to_jsonb(p) ORDER BY p.payment_date, p.created_at) AS payments
          FROM invoice_payments p WHERE p.invoice_id = i.id
        ) pay ON true
        ORDER BY i.created_at DESC
      `;
    }
    return NextResponse.json({ invoices: rows as InvoiceWithAdvertiser[] });
  } catch (err) {
    return NextResponse.json({ error: 'list failed', detail: errMessage(err) }, { status: 500 });
  }
}

export const POST = withAdminTracking(async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const advertiserId = typeof body.advertiser_id === 'number' ? body.advertiser_id : null;
  if (!advertiserId) {
    return NextResponse.json({ error: 'advertiser_id required' }, { status: 400 });
  }

  const agreementId = typeof body.agreement_id === 'string' ? body.agreement_id : null;
  if (agreementId && !UUID_RE.test(agreementId)) {
    return NextResponse.json({ error: 'invalid agreement_id' }, { status: 400 });
  }
  if ('line_items' in body && !Array.isArray(body.line_items)) {
    return NextResponse.json({ error: 'line_items must be an array' }, { status: 400 });
  }
  if ('amount_cents' in body && !isSafeCents(body.amount_cents, { positive: true })) {
    return NextResponse.json({ error: 'amount_cents must be a positive safe integer' }, { status: 400 });
  }
  if ('tax_cents' in body && !isSafeCents(body.tax_cents)) {
    return NextResponse.json({ error: 'tax_cents must be a nonnegative safe integer' }, { status: 400 });
  }
  const lineItems = Array.isArray(body.line_items) ? (body.line_items as InvoiceLineItem[]) : [];
  const explicitAmt = typeof body.amount_cents === 'number' ? body.amount_cents : null;
  let amountCents: number;
  try {
    amountCents = explicitAmt ?? lineItemsTotal(lineItems);
  } catch (error) {
    return NextResponse.json({ error: errMessage(error) }, { status: 400 });
  }
  const taxCents    = typeof body.tax_cents === 'number' ? body.tax_cents : 0;
  const autoChargeRequested = body.auto_charge === true;
  const requestedStatus = body.status ?? 'draft';
  if (
    typeof requestedStatus !== 'string' ||
    !INVOICE_STATUS_VALUES.has(requestedStatus as never) ||
    !['draft', 'sent'].includes(requestedStatus)
  ) {
    return NextResponse.json(
      { error: 'new invoices may only be created as draft or sent; paid status is ledger-derived' },
      { status: 400 },
    );
  }
  const status = requestedStatus;

  if (!isSafeCents(amountCents, { positive: true })) {
    return NextResponse.json({ error: 'amount_cents must be a positive safe integer' }, { status: 400 });
  }
  if (!isSafeCents(taxCents)) {
    return NextResponse.json({ error: 'tax_cents must be a nonnegative safe integer' }, { status: 400 });
  }
  if (!Number.isSafeInteger(amountCents + taxCents)) {
    return NextResponse.json({ error: 'invoice total is too large' }, { status: 400 });
  }
  if ('due_date' in body && body.due_date !== null && !isIsoCalendarDate(body.due_date)) {
    return NextResponse.json({ error: 'due_date must be a real YYYY-MM-DD date or null' }, { status: 400 });
  }
  if ('issued_at' in body && body.issued_at !== null) {
    if (
      typeof body.issued_at !== 'string' ||
      body.issued_at.length < 10 ||
      !isIsoCalendarDate(body.issued_at.slice(0, 10)) ||
      Number.isNaN(Date.parse(body.issued_at))
    ) {
      return NextResponse.json({ error: 'issued_at must contain a valid ISO calendar date or be null' }, { status: 400 });
    }
  }

  try {
    await ensureSchema();
    const sql = getSql();

    // Pull advertiser snapshot for bill_to_* defaults
    const advRows = await sql`SELECT name, contact_email, billing_email, publication, address, address_2, city, state, zip FROM advertisers WHERE id = ${advertiserId}` as unknown as Array<{
      name: string; contact_email: string | null; billing_email: string | null; publication: string;
      address: string | null; address_2: string | null;
      city: string | null; state: string | null; zip: string | null;
    }>;
    if (advRows.length === 0) {
      return NextResponse.json({ error: 'partner not found' }, { status: 400 });
    }
    const adv = advRows[0];

    if (agreementId) {
      const agreementRows = await sql`
        SELECT id
        FROM agreements
        WHERE id = ${agreementId} AND advertiser_id = ${advertiserId}
      `;
      if (agreementRows.length === 0) {
        return NextResponse.json(
          { error: 'agreement not found for advertiser' },
          { status: 400 },
        );
      }
    }

    const billTo = {
      name:    (body.bill_to_name    as string | undefined) ?? adv.name,
      email:   (body.bill_to_email   as string | undefined) ?? adv.billing_email ?? adv.contact_email,
      address: (body.bill_to_address as string | undefined) ??
        ([adv.address, adv.address_2, adv.city, adv.state, adv.zip].filter(Boolean).join(', ') || null),
    };

    // Auto-charge needs an issued invoice: the ledger refuses payments against
    // drafts (see assertInvoicePayable in lib/server/invoice-lifecycle.ts), so a card-on-file
    // invoice is created as 'sent' and then marked 'paid' by the recorded
    // payment. Resolved before the insert so a partner with no saved card
    // simply falls back to the normal draft/manual behaviour.
    let card: ResolvedCardOnFile | null = null;
    let autoChargeError: string | null = null;
    if (autoChargeRequested) {
      card = await resolveCardOnFile({ advertiserId, agreementId });
      if (!card) {
        autoChargeError = agreementId
          ? 'No saved card on the linked agreement — invoice created without charging.'
          : 'No saved card on file for this partner — invoice created without charging.';
      }
    }
    const effectiveStatus = card ? 'sent' : status;

    const issuedAt =
      (body.issued_at as string | null | undefined) ??
      (effectiveStatus === 'sent' ? new Date().toISOString() : null);
    const dueDate =
      (body.due_date as string | null | undefined) ??
      (issuedAt ? addCalendarDays(issuedAt, 20) : null);

    const invoice = await withNeonTransaction(async (client) => {
      const year = new Date().getFullYear();
      let number = typeof body.number === 'string' ? body.number.trim() : '';
      if (!number && body.document_type === 'sales_receipt') {
        const series = `sales_receipt:${year}`;
        await client.query(
          `INSERT INTO document_number_counters (series, next_value)
           SELECT $1,
                  COALESCE(MAX(substring(number from '([0-9]+)$')::integer), 0) + 1
             FROM invoices
            WHERE number LIKE $2
           ON CONFLICT (series) DO NOTHING`,
          [series, `SR-${year}-%`],
        );
        const sequence = await nextDocumentNumber(client, series);
        number = `SR-${year}-${String(sequence).padStart(4, '0')}`;
      } else if (!number) {
        await client.query(
          `INSERT INTO document_number_counters (series, next_value)
           SELECT 'invoice',
                  GREATEST(
                    COALESCE(MAX(
                      CASE
                        WHEN number ~ '^INV #[0-9]+$' THEN substring(number from '[0-9]+')::integer
                        WHEN number ~ '^[0-9]+$' THEN number::integer
                        ELSE NULL
                      END
                    ), 0),
                    16200
                  ) + 1
             FROM invoices
           ON CONFLICT (series) DO NOTHING`,
        );
        const sequence = await nextDocumentNumber(client, 'invoice');
        number = `INV #${sequence}`;
      }

      const rows = await client.query(
        `INSERT INTO invoices (
           advertiser_id, agreement_id, number,
           amount_cents, tax_cents, status,
           issued_at, due_date,
           bill_to_name, bill_to_email, bill_to_address,
           memo, line_items, created_by
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8,
           $9, $10, $11, $12, $13::jsonb, $14
         )
         RETURNING *`,
        [
          advertiserId, agreementId, number, amountCents, taxCents, effectiveStatus,
          issuedAt, dueDate, billTo.name, billTo.email, billTo.address,
          (body.memo as string | null | undefined) ?? null,
          JSON.stringify(lineItems), admin.email ?? null,
        ],
      );
      return rows.rows[0];
    });
    revalidateInvoiceViews(invoice?.id as string | undefined);

    const invoiceId = invoice?.id as string | undefined;
    if (invoiceId && card) {
      const charge = await autoChargeInvoice({
        invoiceId,
        invoiceNumber: (invoice?.number as string | null | undefined) ?? null,
        totalCents: Number(invoice?.total_cents ?? amountCents + taxCents),
        card,
        adminEmail: admin.email ?? null,
      });
      await appendInvoiceAudit(invoiceId, {
        event: charge.ok ? 'invoice_auto_charge_succeeded' : 'invoice_auto_charge_failed',
        user_email: admin.email ?? null,
        details: charge.ok
          ? `Charged card on file \u2014 payment intent ${charge.paymentIntentId}`
          : charge.error,
      }).catch(() => { /* audit is best-effort; never fail a created invoice */ });
      if (!charge.ok) autoChargeError = charge.error;
      captureServerEvent(
        charge.ok ? 'invoice_auto_charge_succeeded' : 'invoice_auto_charge_failed',
        admin?.email ?? 'server',
        { surface: 'admin_invoices', invoice_id: invoiceId, detail: charge.ok ? undefined : charge.error },
      );
      await flushServerEvents();
      revalidateInvoiceViews(invoiceId);
    }

    // The charge is deliberately non-fatal: a declined card must still leave a
    // usable invoice behind, with a warning the admin can act on.
    const fresh = invoiceId
      ? ((await sql`SELECT * FROM invoices WHERE id = ${invoiceId}`) as unknown as unknown[])[0] ?? invoice
      : invoice;
    return NextResponse.json(
      autoChargeError ? { invoice: fresh, auto_charge_error: autoChargeError } : { invoice: fresh },
      { status: 201 },
    );
  } catch (err) {
    console.error('[admin/invoices POST]', errMessage(err));
    captureServerEvent('invoice_create_failed', admin?.email ?? 'server', {
      surface: 'admin_invoices',
      detail: errMessage(err),
    });
    await flushServerEvents();
    return NextResponse.json({ error: 'create failed', detail: errMessage(err) }, { status: 500 });
  }
});
