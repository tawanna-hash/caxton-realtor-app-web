// app/api/admin/invoices/[id]/route.ts
//
// GET    — single invoice
// PATCH  — update allow-listed fields. Status transitions auto-set
//          issued_at / paid_at / voided_at.
// DELETE — drafts delete normally; issued records require an explicit,
//          typed-ID permanent-delete acknowledgement.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import {
  INVOICE_PATCHABLE_FIELDS,
  INVOICE_STATUS_VALUES,
  isIsoCalendarDate,
  isSafeCents,
  lineItemsTotal,
  type Invoice,
  type InvoiceAuditEntry,
  type InvoiceLineItem,
  type InvoiceWithAdvertiser,
} from '@/lib/invoices';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { revalidateInvoiceViews } from '@/lib/server/revalidate-invoice-views';
import { withNeonTransaction } from '@/lib/server/db/neon';
import {
  invalidateInvoiceCheckoutSessions,
  recalculateInvoiceFromLedger,
} from '@/lib/server/invoice-lifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteCtx = { params: Promise<{ id: string }> };

class PatchError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409) {
    super(message);
  }
}

const SUPPORTED_PATCH_FIELDS = new Set([
  'agreement_id', 'number', 'amount_cents', 'tax_cents', 'status',
  'stripe_invoice_id', 'stripe_payment_intent_id', 'stripe_payment_link_url',
  'issued_at', 'due_date', 'bill_to_name', 'bill_to_email',
  'bill_to_address', 'memo', 'line_items',
]);

function validNullableTimestamp(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== 'string' || value.length < 10 || !isIsoCalendarDate(value.slice(0, 10))) return false;
  return !Number.isNaN(Date.parse(value));
}

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
        COALESCE(pay.amount_paid_cents, CASE WHEN i.status = 'paid' THEN i.total_cents ELSE 0 END)::int AS amount_paid_cents,
        GREATEST(i.total_cents - COALESCE(pay.amount_paid_cents, CASE WHEN i.status = 'paid' THEN i.total_cents ELSE 0 END), 0)::int AS balance_cents,
        COALESCE(pay.payments, '[]'::jsonb) AS payments,
        (i.status NOT IN ('paid','void') AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE) AS is_overdue
      FROM invoices i
      LEFT JOIN advertisers adv ON adv.id = i.advertiser_id
      LEFT JOIN LATERAL (
        SELECT sum(p.amount_cents)::int AS amount_paid_cents,
          jsonb_agg(to_jsonb(p) ORDER BY p.payment_date, p.created_at) AS payments
        FROM invoice_payments p WHERE p.invoice_id = i.id
      ) pay ON true
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
    const unsupported = Object.keys(body).filter((field) => !SUPPORTED_PATCH_FIELDS.has(field));
    if (unsupported.length > 0) {
      return NextResponse.json(
        { error: `unsupported field${unsupported.length === 1 ? '' : 's'}: ${unsupported.join(', ')}` },
        { status: 400 },
      );
    }
    if ('status' in body) {
      if (typeof body.status !== 'string' || !INVOICE_STATUS_VALUES.has(body.status as never)) {
        return NextResponse.json({ error: 'invalid status' }, { status: 400 });
      }
      if (body.status === 'paid') {
        return NextResponse.json(
          { error: 'status paid is ledger-derived; record a payment instead' },
          { status: 400 },
        );
      }
    }
    if ('amount_cents' in body && !isSafeCents(body.amount_cents, { positive: true })) {
      return NextResponse.json({ error: 'amount_cents must be a positive safe integer' }, { status: 400 });
    }
    if ('tax_cents' in body && !isSafeCents(body.tax_cents)) {
      return NextResponse.json({ error: 'tax_cents must be a nonnegative safe integer' }, { status: 400 });
    }
    if ('due_date' in body && body.due_date !== null && !isIsoCalendarDate(body.due_date)) {
      return NextResponse.json({ error: 'due_date must be a real YYYY-MM-DD date or null' }, { status: 400 });
    }
    if ('issued_at' in body && !validNullableTimestamp(body.issued_at)) {
      return NextResponse.json({ error: 'issued_at must contain a valid ISO calendar date or be null' }, { status: 400 });
    }
    if ('line_items' in body && !Array.isArray(body.line_items)) {
      return NextResponse.json({ error: 'line_items must be an array' }, { status: 400 });
    }
    try {
      if (Array.isArray(body.line_items) && !('amount_cents' in body)) {
        body.amount_cents = lineItemsTotal(body.line_items as InvoiceLineItem[]);
      } else if (Array.isArray(body.line_items)) {
        lineItemsTotal(body.line_items as InvoiceLineItem[]);
      }
    } catch (error) {
      return NextResponse.json({ error: errMessage(error) }, { status: 400 });
    }

    const result = await withNeonTransaction(async (client) => {
      const existingResult = await client.query<Invoice & { amount_paid_cents: number }>(
        `SELECT i.*,
           COALESCE((SELECT SUM(p.amount_cents) FROM invoice_payments p WHERE p.invoice_id = i.id), 0)::int
             AS amount_paid_cents
           FROM invoices i WHERE i.id = $1 FOR UPDATE`,
        [id],
      );
      const current = existingResult.rows[0];
      if (!current) throw new PatchError('not found', 404);
      if (body.status === 'draft' && current.status !== 'draft') {
        throw new PatchError('an issued invoice cannot be moved back to draft', 400);
      }

      if ('number' in body) {
        if (body.number !== null && typeof body.number !== 'string') {
          throw new PatchError('number must be a string or null', 400);
        }
        body.number = typeof body.number === 'string' ? body.number.trim() || null : null;
        if (body.number === (current.number?.trim() ?? null)) delete body.number;
      }
      if ('agreement_id' in body && body.agreement_id !== null) {
        if (typeof body.agreement_id !== 'string' || !UUID_RE.test(body.agreement_id)) {
          throw new PatchError('invalid agreement_id', 400);
        }
        const agreement = await client.query(
          `SELECT id FROM agreements WHERE id = $1 AND advertiser_id = $2`,
          [body.agreement_id, current.advertiser_id],
        );
        if (!agreement.rowCount) throw new PatchError('agreement not found for advertiser', 400);
      }

      if (body.status === 'sent' && current.status === 'draft' && !('issued_at' in body)) {
        body.issued_at = new Date().toISOString();
      }

      const amountCents = 'amount_cents' in body ? Number(body.amount_cents) : Number(current.amount_cents);
      const taxCents = 'tax_cents' in body ? Number(body.tax_cents) : Number(current.tax_cents);
      if (!Number.isSafeInteger(amountCents + taxCents) || amountCents + taxCents <= 0) {
        throw new PatchError('invoice total must be a positive safe integer', 400);
      }
      if (amountCents + taxCents < Number(current.amount_paid_cents)) {
        throw new PatchError('invoice total cannot be less than payments already recorded', 400);
      }

      const updated: string[] = [];
      for (const field of INVOICE_PATCHABLE_FIELDS) {
        if (!(field in body)) continue;
        const raw = body[field as keyof typeof body];
        switch (field) {
          case 'agreement_id':             await client.query('UPDATE invoices SET agreement_id = $2 WHERE id = $1', [id, raw]); break;
          case 'number':                   await client.query('UPDATE invoices SET number = $2 WHERE id = $1', [id, raw]); break;
          case 'amount_cents':             await client.query('UPDATE invoices SET amount_cents = $2 WHERE id = $1', [id, raw]); break;
          case 'tax_cents':                await client.query('UPDATE invoices SET tax_cents = $2 WHERE id = $1', [id, raw]); break;
          case 'status':
            await client.query(
              `UPDATE invoices SET status = $2,
                 voided_at = CASE WHEN $2 = 'void' THEN NOW() ELSE NULL END
               WHERE id = $1`,
              [id, raw],
            );
            break;
          case 'stripe_invoice_id':        await client.query('UPDATE invoices SET stripe_invoice_id = $2 WHERE id = $1', [id, raw]); break;
          case 'stripe_payment_intent_id': await client.query('UPDATE invoices SET stripe_payment_intent_id = $2 WHERE id = $1', [id, raw]); break;
          case 'stripe_payment_link_url':  await client.query('UPDATE invoices SET stripe_payment_link_url = $2 WHERE id = $1', [id, raw]); break;
          case 'issued_at':                await client.query('UPDATE invoices SET issued_at = $2 WHERE id = $1', [id, raw]); break;
          case 'due_date':                 await client.query('UPDATE invoices SET due_date = $2 WHERE id = $1', [id, raw]); break;
          case 'bill_to_name':             await client.query('UPDATE invoices SET bill_to_name = $2 WHERE id = $1', [id, raw]); break;
          case 'bill_to_email':            await client.query('UPDATE invoices SET bill_to_email = $2 WHERE id = $1', [id, raw]); break;
          case 'bill_to_address':          await client.query('UPDATE invoices SET bill_to_address = $2 WHERE id = $1', [id, raw]); break;
          case 'memo':                     await client.query('UPDATE invoices SET memo = $2 WHERE id = $1', [id, raw]); break;
          case 'line_items':               await client.query('UPDATE invoices SET line_items = $2::jsonb WHERE id = $1', [id, JSON.stringify(raw)]); break;
        }
        updated.push(field);
      }
      if (updated.length === 0) throw new PatchError('no patchable fields', 400);

      const changes = Object.fromEntries(updated.map((field) => [
        field,
        { from: current[field as keyof Invoice] ?? null, to: body[field] ?? null },
      ]));
      const auditEntry: InvoiceAuditEntry = {
        event: 'invoice_updated',
        timestamp: new Date().toISOString(),
        user_email: admin.email ?? null,
        fields: updated,
        changes,
      };
      await client.query(
        `UPDATE invoices
            SET audit_log = COALESCE(audit_log, '[]'::jsonb) || $2::jsonb,
                updated_at = NOW()
          WHERE id = $1`,
        [id, JSON.stringify(auditEntry)],
      );

      const lifecycleChanged = updated.some((field) =>
        ['amount_cents', 'tax_cents', 'line_items', 'status'].includes(field),
      );
      if (lifecycleChanged && !(current.status === 'draft' && body.status !== 'sent' && body.status !== 'void')) {
        await recalculateInvoiceFromLedger(client, id);
      }
      await invalidateInvoiceCheckoutSessions(client, id);
      const rows = await client.query('SELECT * FROM invoices WHERE id = $1', [id]);
      return { invoice: rows.rows[0], updated };
    });
    revalidateInvoiceViews(id);
    return NextResponse.json({ invoice: result.invoice, updated_fields: result.updated });
  } catch (err) {
    console.error('[admin/invoices PATCH]', errMessage(err));
    if (err instanceof PatchError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (errMessage(err).includes('invoices_number_key')) {
      return NextResponse.json(
        { error: 'That invoice number is already in use. Choose a different number.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'patch failed', detail: errMessage(err) }, { status: 500 });
  }
});

export const DELETE = withAdminTracking(async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  try {
    await ensureSchema();
    let body: { permanent?: unknown; confirmation_id?: unknown } = {};
    try { body = await req.json(); } catch { /* Draft deletes need no body. */ }
    await withNeonTransaction(async (client) => {
      const rows = await client.query<{ status: string }>(
        'SELECT status FROM invoices WHERE id = $1 FOR UPDATE',
        [id],
      );
      if (!rows.rows[0]) throw new PatchError('not found', 404);
      if (
        rows.rows[0].status !== 'draft' &&
        (body.permanent !== true || body.confirmation_id !== id)
      ) {
        throw new PatchError(
          'issued invoices must be voided by default. To permanently delete, send permanent: true and confirmation_id equal to the invoice id.',
          409,
        );
      }
      await invalidateInvoiceCheckoutSessions(client, id);
      await client.query('DELETE FROM invoices WHERE id = $1', [id]);
    });
    revalidateInvoiceViews(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PatchError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'delete failed', detail: errMessage(err) }, { status: 500 });
  }
});
