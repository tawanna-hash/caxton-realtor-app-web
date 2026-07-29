// app/api/admin/invoices/[id]/route.ts
//
// GET    — single invoice
// PATCH  — update allow-listed fields. Status transitions auto-set
//          issued_at / paid_at / voided_at.
// DELETE — hard delete (only when status='draft')

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import {
  INVOICE_PATCHABLE_FIELDS,
  INVOICE_STATUS_VALUES,
  type InvoiceWithAdvertiser,
} from '@/lib/invoices';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT i.*, adv.name AS advertiser_name,
        (i.status NOT IN ('paid','void') AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE) AS is_overdue
      FROM invoices i
      LEFT JOIN advertisers adv ON adv.id = i.advertiser_id
      WHERE i.id = ${id}
    `) as unknown as InvoiceWithAdvertiser[];
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ invoice: rows[0] });
  } catch (err) {
    return NextResponse.json({ error: 'get failed', detail: errMessage(err) }, { status: 500 });
  }
}

export const PATCH = withAdminTracking(async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();
    const existing = await sql`SELECT status FROM invoices WHERE id = ${id}` as unknown as Array<{ status: string }>;
    if (existing.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const prevStatus = existing[0].status;

    // Auto-stamp status lifecycle timestamps
    if ('status' in body && typeof body.status === 'string' && INVOICE_STATUS_VALUES.has(body.status as never)) {
      const next = body.status as string;
      if (next === 'sent' && prevStatus === 'draft' && !('issued_at' in body)) {
        body.issued_at = new Date().toISOString();
      }
      if (next === 'paid' && !('paid_at' in body)) {
        body.paid_at = new Date().toISOString();
      }
      if (next === 'void' && !('voided_at' in body)) {
        body.voided_at = new Date().toISOString();
      }
    }

    const updated: string[] = [];
    for (const field of INVOICE_PATCHABLE_FIELDS) {
      if (!(field in body)) continue;
      const raw = body[field as keyof typeof body];

      if (field === 'status' && typeof raw === 'string' && !INVOICE_STATUS_VALUES.has(raw as never)) continue;

      switch (field) {
        case 'agreement_id':             await sql`UPDATE invoices SET agreement_id = ${raw}                            WHERE id = ${id}`; break;
        case 'number':                   await sql`UPDATE invoices SET number = ${raw}                                  WHERE id = ${id}`; break;
        case 'amount_cents':             await sql`UPDATE invoices SET amount_cents = ${raw}                            WHERE id = ${id}`; break;
        case 'tax_cents':                await sql`UPDATE invoices SET tax_cents = ${raw}                               WHERE id = ${id}`; break;
        case 'status':                   await sql`UPDATE invoices SET status = ${raw}                                  WHERE id = ${id}`; break;
        case 'stripe_invoice_id':        await sql`UPDATE invoices SET stripe_invoice_id = ${raw}                       WHERE id = ${id}`; break;
        case 'stripe_payment_intent_id': await sql`UPDATE invoices SET stripe_payment_intent_id = ${raw}                WHERE id = ${id}`; break;
        case 'stripe_payment_link_url':  await sql`UPDATE invoices SET stripe_payment_link_url = ${raw}                 WHERE id = ${id}`; break;
        case 'issued_at':                await sql`UPDATE invoices SET issued_at = ${raw}                               WHERE id = ${id}`; break;
        case 'due_date':                 await sql`UPDATE invoices SET due_date = ${raw}                                WHERE id = ${id}`; break;
        case 'paid_at':                  await sql`UPDATE invoices SET paid_at = ${raw}                                 WHERE id = ${id}`; break;
        case 'voided_at':                await sql`UPDATE invoices SET voided_at = ${raw}                               WHERE id = ${id}`; break;
        case 'bill_to_name':             await sql`UPDATE invoices SET bill_to_name = ${raw}                            WHERE id = ${id}`; break;
        case 'bill_to_email':            await sql`UPDATE invoices SET bill_to_email = ${raw}                           WHERE id = ${id}`; break;
        case 'bill_to_address':          await sql`UPDATE invoices SET bill_to_address = ${raw}                         WHERE id = ${id}`; break;
        case 'memo':                     await sql`UPDATE invoices SET memo = ${raw}                                    WHERE id = ${id}`; break;
        case 'line_items':               await sql`UPDATE invoices SET line_items = ${JSON.stringify(Array.isArray(raw) ? raw : [])}::jsonb WHERE id = ${id}`; break;
      }
      updated.push(field);
    }

    if (updated.length === 0) return NextResponse.json({ error: 'no patchable fields' }, { status: 400 });
    await sql`UPDATE invoices SET updated_at = NOW() WHERE id = ${id}`;
    const rows = await sql`SELECT * FROM invoices WHERE id = ${id}`;
    return NextResponse.json({ invoice: rows[0], updated_fields: updated });
  } catch (err) {
    console.error('[admin/invoices PATCH]', errMessage(err));
    return NextResponse.json({ error: 'patch failed', detail: errMessage(err) }, { status: 500 });
  }
});

export const DELETE = withAdminTracking(async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  try {
    await ensureSchema();
    const sql = getSql();
    // Only allow deleting drafts; sent/paid/void invoices stay as
    // records (use status=void instead).
    const rows = await sql`SELECT status FROM invoices WHERE id = ${id}` as unknown as Array<{ status: string }>;
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (rows[0].status !== 'draft') {
      return NextResponse.json({ error: 'only draft invoices may be deleted; use status=void instead' }, { status: 400 });
    }
    await sql`DELETE FROM invoices WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: 'delete failed', detail: errMessage(err) }, { status: 500 });
  }
});
