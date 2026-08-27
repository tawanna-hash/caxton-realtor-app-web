// app/api/admin/invoices/route.ts
//
// GET  — list all invoices (optionally filter by advertiser_id or agreement_id)
// POST — create a new invoice (auto-numbered per publication)

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import {
  INVOICE_STATUS_VALUES,
  formatInvoiceNumber,
  lineItemsTotal,
  type InvoiceLineItem,
  type InvoiceWithAdvertiser,
} from '@/lib/invoices';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { captureServerEvent, flushServerEvents } from '@/lib/server/posthog';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
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
    let rows: unknown[];
    if (advertiserId !== null) {
      rows = await sql`
        SELECT i.*, adv.name AS advertiser_name,
          (i.status NOT IN ('paid','void','draft') AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE) AS is_overdue
        FROM invoices i
        LEFT JOIN advertisers adv ON adv.id = i.advertiser_id
        WHERE i.advertiser_id = ${advertiserId}
        ORDER BY i.created_at DESC
      `;
    } else if (agreementId) {
      rows = await sql`
        SELECT i.*, adv.name AS advertiser_name,
          (i.status NOT IN ('paid','void','draft') AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE) AS is_overdue
        FROM invoices i
        LEFT JOIN advertisers adv ON adv.id = i.advertiser_id
        WHERE i.agreement_id = ${agreementId}
        ORDER BY i.created_at DESC
      `;
    } else {
      rows = await sql`
        SELECT i.*, adv.name AS advertiser_name,
          (i.status NOT IN ('paid','void','draft') AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE) AS is_overdue
        FROM invoices i
        LEFT JOIN advertisers adv ON adv.id = i.advertiser_id
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
  const lineItems   = Array.isArray(body.line_items) ? (body.line_items as InvoiceLineItem[]) : [];
  const explicitAmt = typeof body.amount_cents === 'number' ? body.amount_cents : null;
  const amountCents = explicitAmt ?? lineItemsTotal(lineItems);
  const taxCents    = typeof body.tax_cents === 'number' ? body.tax_cents : 0;
  const status      = typeof body.status === 'string' && INVOICE_STATUS_VALUES.has(body.status as never)
    ? (body.status as string) : 'draft';

  if (amountCents <= 0) {
    return NextResponse.json({ error: 'amount_cents must be > 0' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();

    // Pull advertiser snapshot for bill_to_* defaults
    const advRows = await sql`SELECT name, contact_email, publication, address, address_2, city, state, zip FROM advertisers WHERE id = ${advertiserId}` as unknown as Array<{
      name: string; contact_email: string | null; publication: string;
      address: string | null; address_2: string | null;
      city: string | null; state: string | null; zip: string | null;
    }>;
    if (advRows.length === 0) {
      return NextResponse.json({ error: 'partner not found' }, { status: 400 });
    }
    const adv = advRows[0];

    // Generate invoice number per publication per year
    const year = new Date().getFullYear();
    const seqRows = await sql`
      SELECT count(*)::int AS n FROM invoices i
      JOIN advertisers a ON a.id = i.advertiser_id
      WHERE a.publication = ${adv.publication}
        AND EXTRACT(YEAR FROM i.created_at) = ${year}
    ` as unknown as Array<{ n: number }>;
    const number = (body.number as string | undefined) || formatInvoiceNumber(adv.publication, year, (seqRows[0]?.n ?? 0) + 1);

    const billTo = {
      name:    (body.bill_to_name    as string | undefined) ?? adv.name,
      email:   (body.bill_to_email   as string | undefined) ?? adv.contact_email,
      address: (body.bill_to_address as string | undefined) ??
        ([adv.address, adv.address_2, adv.city, adv.state, adv.zip].filter(Boolean).join(', ') || null),
    };

    const rows = await sql`
      INSERT INTO invoices (
        advertiser_id, agreement_id, number,
        amount_cents, tax_cents, status,
        issued_at, due_date,
        bill_to_name, bill_to_email, bill_to_address,
        memo, line_items, created_by
      ) VALUES (
        ${advertiserId},
        ${agreementId},
        ${number},
        ${amountCents},
        ${taxCents},
        ${status},
        ${status === 'sent' ? new Date().toISOString() : null},
        ${(body.due_date as string | null | undefined) ?? null},
        ${billTo.name},
        ${billTo.email},
        ${billTo.address},
        ${(body.memo as string | null | undefined) ?? null},
        ${JSON.stringify(lineItems)}::jsonb,
        ${admin.email ?? null}
      )
      RETURNING *
    `;
    return NextResponse.json({ invoice: rows[0] }, { status: 201 });
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
