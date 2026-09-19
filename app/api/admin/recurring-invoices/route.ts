// app/api/admin/recurring-invoices/route.ts
//
// GET  — list all recurring invoice schedules (optionally filter by advertiser_id/agreement_id/status)
// POST — create a schedule. Supports both agreement-linked (agreement_id set)
//        and standalone (agreement_id null) schedules.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import {
  isIsoCalendarDate,
  isSafeCents,
  lineItemsTotal,
  type InvoiceLineItem,
} from '@/lib/invoices';
import {
  RECURRING_FREQUENCY_VALUES,
  type RecurringFrequency,
  type RecurringScheduleWithAdvertiser,
} from '@/lib/recurring-invoices';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
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
  const agreementId = searchParams.get('agreement_id');
  const statusParam = searchParams.get('status');
  const advertiserId = advertiserParam && Number.isInteger(+advertiserParam) ? +advertiserParam : null;

  try {
    await ensureSchema();
    const sql = getSql();

    const rows = await sql`
      SELECT s.*, adv.name AS advertiser_name
      FROM recurring_invoice_schedules s
      LEFT JOIN advertisers adv ON adv.id = s.advertiser_id
      WHERE (${advertiserId}::int IS NULL OR s.advertiser_id = ${advertiserId})
        AND (${agreementId}::uuid IS NULL OR s.agreement_id = ${agreementId})
        AND (${statusParam}::text IS NULL OR s.status = ${statusParam})
      ORDER BY s.next_run_at ASC
    `;
    return NextResponse.json({ schedules: rows as RecurringScheduleWithAdvertiser[] });
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
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;
  if (!name) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }
  const agreementId = typeof body.agreement_id === 'string' && body.agreement_id ? body.agreement_id : null;
  const source = agreementId ? 'agreement' : 'standalone';

  const frequency: RecurringFrequency =
    typeof body.frequency === 'string' && RECURRING_FREQUENCY_VALUES.has(body.frequency as RecurringFrequency)
      ? (body.frequency as RecurringFrequency)
      : 'monthly';
  const intervalCount = typeof body.interval_count === 'number' && body.interval_count > 0 ? Math.floor(body.interval_count) : 1;
  const dayOfMonth =
    typeof body.day_of_month === 'number'
      ? Math.min(28, Math.max(1, Math.floor(body.day_of_month)))
      : null;
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
  const taxCents = typeof body.tax_cents === 'number' ? body.tax_cents : 0;
  const dueDays = typeof body.due_days === 'number' && body.due_days >= 0 ? Math.floor(body.due_days) : 15;
  const createDaysInAdvance =
    typeof body.create_days_in_advance === 'number' && body.create_days_in_advance >= 0
      ? Math.floor(body.create_days_in_advance)
      : 0;
  const templateMode =
    body.template_mode === 'reminder' || body.template_mode === 'unscheduled'
      ? body.template_mode
      : 'scheduled';
  const autoSend = body.auto_send !== false;
  const startDate = typeof body.start_date === 'string' && body.start_date ? body.start_date : new Date().toISOString().slice(0, 10);
  const endDate = typeof body.end_date === 'string' && body.end_date ? body.end_date : null;
  const maxOccurrences = typeof body.max_occurrences === 'number' && body.max_occurrences > 0 ? Math.floor(body.max_occurrences) : null;

  if (!isSafeCents(amountCents, { positive: true })) {
    return NextResponse.json({ error: 'amount_cents must be a positive safe integer' }, { status: 400 });
  }
  if (!isSafeCents(taxCents)) {
    return NextResponse.json({ error: 'tax_cents must be a nonnegative safe integer' }, { status: 400 });
  }
  if (!Number.isSafeInteger(amountCents + taxCents)) {
    return NextResponse.json({ error: 'invoice total is too large' }, { status: 400 });
  }
  if (!isIsoCalendarDate(startDate)) {
    return NextResponse.json({ error: 'start_date must be a real YYYY-MM-DD date' }, { status: 400 });
  }
  if (endDate !== null && !isIsoCalendarDate(endDate)) {
    return NextResponse.json({ error: 'end_date must be a real YYYY-MM-DD date or null' }, { status: 400 });
  }
  if (endDate !== null && endDate < startDate) {
    return NextResponse.json({ error: 'end_date cannot be before start_date' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();

    const advRows = (await sql`
      SELECT name, contact_email, billing_email, address, address_2, city, state, zip
      FROM advertisers WHERE id = ${advertiserId}
    `) as unknown as Array<{
      name: string; contact_email: string | null; billing_email: string | null;
      address: string | null; address_2: string | null; city: string | null; state: string | null; zip: string | null;
    }>;
    if (advRows.length === 0) {
      return NextResponse.json({ error: 'partner not found' }, { status: 400 });
    }
    const adv = advRows[0];

    const billTo = {
      name: (body.bill_to_name as string | undefined) ?? adv.name,
      email: (body.bill_to_email as string | undefined) ?? adv.billing_email ?? adv.contact_email,
      address: (body.bill_to_address as string | undefined) ??
        ([adv.address, adv.address_2, adv.city, adv.state, adv.zip].filter(Boolean).join(', ') || null),
    };

    // For month-based schedules, anchor the first invoice to the selected
    // day on or after the start date. The cron creates it early according
    // to create_days_in_advance while preserving the invoice date here.
    const start = new Date(`${startDate}T08:00:00.000Z`);
    if (dayOfMonth && (frequency === 'monthly' || frequency === 'quarterly' || frequency === 'annually')) {
      const candidate = new Date(start);
      candidate.setUTCDate(dayOfMonth);
      if (candidate < start) {
        candidate.setUTCMonth(candidate.getUTCMonth() + (frequency === 'quarterly' ? 3 : frequency === 'annually' ? 12 : 1));
      }
      start.setTime(candidate.getTime());
    }
    const nextRunAt = start.toISOString();

    const rows = await sql`
      INSERT INTO recurring_invoice_schedules (
        advertiser_id, agreement_id, name, status, frequency, interval_count, day_of_month,
        amount_cents, tax_cents, line_items, memo,
        bill_to_name, bill_to_email, bill_to_address,
        auto_send, due_days, create_days_in_advance, template_mode,
        include_unbilled_charges, print_later, email_reminders,
        payment_instructions, note_to_client, statement_memo,
        start_date, end_date, max_occurrences,
        next_run_at, source, created_by
      ) VALUES (
        ${advertiserId}, ${agreementId}, ${name}, 'active', ${frequency}, ${intervalCount}, ${dayOfMonth},
        ${amountCents}, ${taxCents}, ${JSON.stringify(lineItems)}::jsonb,
        ${(body.memo as string | null | undefined) ?? null},
        ${billTo.name}, ${billTo.email}, ${billTo.address},
        ${autoSend}, ${dueDays}, ${createDaysInAdvance}, ${templateMode},
        ${body.include_unbilled_charges === true}, ${body.print_later === true}, ${body.email_reminders !== false},
        ${(body.payment_instructions as string | null | undefined) ?? null},
        ${(body.note_to_client as string | null | undefined) ?? null},
        ${(body.statement_memo as string | null | undefined) ?? null},
        ${startDate}, ${endDate}, ${maxOccurrences},
        ${nextRunAt}, ${source}, ${admin.email ?? null}
      )
      RETURNING *
    `;
    return NextResponse.json({ schedule: rows[0] }, { status: 201 });
  } catch (err) {
    console.error('[admin/recurring-invoices POST]', errMessage(err));
    return NextResponse.json({ error: 'create failed', detail: errMessage(err) }, { status: 500 });
  }
});
