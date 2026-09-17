import { randomUUID } from 'node:crypto';
import { ensureSchema, getSql } from '@/lib/db';
import { isSafeCents } from '@/lib/invoices';
import { paymentMethodLabel, processingFeeCents } from '@/lib/payment-processing-fees';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { withNeonTransaction } from '@/lib/server/db/neon';
import {
  InvoiceLifecycleError,
  invalidateInvoiceCheckoutSessions,
  lockInvoiceRemainingBalance,
  markCheckoutSessionFailed,
  markCheckoutSessionOpen,
  registerInvoiceCheckoutSession,
} from '@/lib/server/invoice-lifecycle';

const APP_BASE_URL = process.env.APP_BASE_URL ?? 'https://app.myrealtyline.com';

export type PartnerStatementInvoice = {
  id: string;
  number: string | null;
  total_cents: number;
  issued_at: string | Date | null;
  due_date: string | Date | null;
  amount_paid_cents: number;
  balance_cents: number;
  is_overdue: boolean;
  stripe_payment_link_url: string | null;
  stripe_checkout_session_id: string | null;
};

export type PartnerStatement = {
  advertiserId: number;
  advertiserName: string;
  recipientEmail: string | null;
  billToName: string;
  billToEmail: string | null;
  billToAddress: string | null;
  asOf: Date;
  overdueCents: number;
  notYetDueCents: number;
  outstandingCents: number;
  overduePaymentLinkUrl: string | null;
  invoices: PartnerStatementInvoice[];
};

export type StatementInvoiceAllocation = {
  invoiceId: string;
  invoiceNumber: string;
  amountCents: number;
};

type StatementPaymentSessionRow = {
  id: string;
  checkout_url: string;
  stripe_checkout_session_id: string | null;
};

export async function loadPartnerStatement(advertiserId: number): Promise<PartnerStatement | null> {
  await ensureSchema();
  const sql = getSql();
  const advertisers = (await sql`
    SELECT id, name, billing_email, contact_email, portal_email
    FROM advertisers
    WHERE id = ${advertiserId}
  `) as unknown as Array<{
    id: number;
    name: string;
    billing_email: string | null;
    contact_email: string | null;
    portal_email: string | null;
  }>;
  const advertiser = advertisers[0];
  if (!advertiser) return null;

  const invoices = (await sql`
    SELECT i.id, i.number, i.total_cents, i.issued_at, i.due_date,
      i.stripe_payment_link_url, i.stripe_checkout_session_id,
      COALESCE(pay.amount_paid_cents, CASE WHEN i.status = 'paid' THEN i.total_cents ELSE 0 END)::int AS amount_paid_cents,
      GREATEST(i.total_cents - COALESCE(pay.amount_paid_cents, CASE WHEN i.status = 'paid' THEN i.total_cents ELSE 0 END), 0)::int AS balance_cents,
      (i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE) AS is_overdue
    FROM invoices i
    LEFT JOIN LATERAL (
      SELECT SUM(p.amount_cents)::int AS amount_paid_cents
      FROM invoice_payments p
      WHERE p.invoice_id = i.id
    ) pay ON true
    WHERE i.advertiser_id = ${advertiserId}
      AND i.status NOT IN ('paid', 'void', 'draft')
      AND GREATEST(i.total_cents - COALESCE(pay.amount_paid_cents, 0), 0) > 0
    ORDER BY i.issued_at ASC NULLS LAST, i.created_at ASC
  `) as unknown as PartnerStatementInvoice[];
  if (invoices.length === 0) return null;

  const billRows = (await sql`
    SELECT bill_to_name, bill_to_email, bill_to_address
    FROM invoices
    WHERE advertiser_id = ${advertiserId}
      AND (
        NULLIF(TRIM(bill_to_name), '') IS NOT NULL
        OR NULLIF(TRIM(bill_to_email), '') IS NOT NULL
        OR NULLIF(TRIM(bill_to_address), '') IS NOT NULL
      )
    ORDER BY created_at DESC
    LIMIT 1
  `) as unknown as Array<{
    bill_to_name: string | null;
    bill_to_email: string | null;
    bill_to_address: string | null;
  }>;
  const bill = billRows[0];
  const clean = (value: string | null | undefined) => value?.trim() || null;
  const overdueCents = invoices
    .filter((invoice) => invoice.is_overdue)
    .reduce((sum, invoice) => sum + Number(invoice.balance_cents), 0);
  const notYetDueCents = invoices
    .filter((invoice) => !invoice.is_overdue)
    .reduce((sum, invoice) => sum + Number(invoice.balance_cents), 0);

  return {
    advertiserId,
    advertiserName: advertiser.name,
    recipientEmail:
      clean(advertiser.billing_email) ??
      clean(bill?.bill_to_email) ??
      clean(advertiser.contact_email) ??
      clean(advertiser.portal_email),
    billToName: clean(bill?.bill_to_name) ?? advertiser.name,
    billToEmail: clean(bill?.bill_to_email),
    billToAddress: clean(bill?.bill_to_address),
    asOf: new Date(),
    overdueCents,
    notYetDueCents,
    outstandingCents: overdueCents + notYetDueCents,
    overduePaymentLinkUrl: null,
    invoices,
  };
}

function overdueAllocations(statement: PartnerStatement): StatementInvoiceAllocation[] {
  return statement.invoices
    .filter((invoice) => invoice.is_overdue)
    .map((invoice) => {
      const amountCents = Number(invoice.balance_cents);
      if (!isSafeCents(amountCents, { positive: true })) {
        throw new InvoiceLifecycleError('statement contains an invalid invoice amount', 400);
      }
      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.number ?? invoice.id.slice(0, 8),
        amountCents,
      };
    });
}

function sumSafeCents(values: number[], label: string): number {
  let total = 0;
  for (const value of values) {
    if (!isSafeCents(value, { positive: true })) {
      throw new InvoiceLifecycleError(`${label} contains an invalid amount`, 400);
    }
    total += value;
    if (!isSafeCents(total, { positive: true })) {
      throw new InvoiceLifecycleError(`${label} total is invalid`, 400);
    }
  }
  return total;
}

export async function getOrCreatePartnerStatementOverdueLink(
  statement: PartnerStatement,
  options: { forceRefresh?: boolean } = {},
): Promise<PartnerStatement> {
  const requestedAllocations = overdueAllocations(statement);
  if (requestedAllocations.length === 0) {
    return { ...statement, overduePaymentLinkUrl: null };
  }
  if (!isStripeConfigured()) throw new Error('Stripe is not configured');

  await ensureSchema();
  const stripe = getStripe();
  let createdStripeSessionId: string | null = null;
  try {
    const result = await withNeonTransaction(async (client) => {
      // A stable lock order prevents two overlapping "pay all" requests from
      // deadlocking while still serializing them against individual links.
      const requestedById = new Map(requestedAllocations.map((allocation) => [
        allocation.invoiceId,
        allocation,
      ]));
      const allocations: StatementInvoiceAllocation[] = [];
      for (const invoiceId of [...requestedById.keys()].sort()) {
        const { remainingCents } = await lockInvoiceRemainingBalance(client, invoiceId);
        const owner = await client.query<{ advertiser_id: number | null; number: string | null }>(
          `SELECT advertiser_id, number FROM invoices WHERE id = $1`,
          [invoiceId],
        );
        if (owner.rows[0]?.advertiser_id !== statement.advertiserId) {
          throw new InvoiceLifecycleError('invoice does not belong to this statement', 400);
        }
        allocations.push({
          invoiceId,
          invoiceNumber:
            owner.rows[0].number ??
            requestedById.get(invoiceId)?.invoiceNumber ??
            invoiceId.slice(0, 8),
          amountCents: remainingCents,
        });
      }

      const allocationsJson = JSON.stringify(allocations);
      if (!options.forceRefresh) {
        const existing = await client.query<StatementPaymentSessionRow>(
          `SELECT id, checkout_url, stripe_checkout_session_id
             FROM statement_payment_sessions
            WHERE advertiser_id = $1
              AND status = 'open'
              AND (expires_at IS NULL OR expires_at > NOW())
              AND invoice_allocations = $2::jsonb
            ORDER BY created_at DESC
            LIMIT 1`,
          [statement.advertiserId, allocationsJson],
        );
        if (existing.rows[0]?.checkout_url) {
          return { url: existing.rows[0].checkout_url, allocations };
        }
      }

      // This expires every individual checkout and every open statement
      // session containing any charged invoice. It is intentionally stronger
      // than advertiser-wide expiry: unrelated statements remain usable.
      for (const allocation of allocations) {
        await invalidateInvoiceCheckoutSessions(client, allocation.invoiceId);
        const stillOpen = await client.query<{ id: string }>(
          `SELECT id
             FROM statement_payment_sessions
            WHERE status = 'open'
              AND invoice_allocations @> $1::jsonb
            LIMIT 1`,
          [JSON.stringify([{ invoiceId: allocation.invoiceId }])],
        );
        const stillOpenInvoice = await client.query<{ id: string }>(
          `SELECT id
             FROM invoice_checkout_sessions
            WHERE invoice_id = $1
              AND status IN ('creating', 'open')
            LIMIT 1`,
          [allocation.invoiceId],
        );
        if (stillOpen.rows.length > 0 || stillOpenInvoice.rows.length > 0) {
          throw new InvoiceLifecycleError(
            'an existing checkout session could not be safely expired',
            409,
          );
        }
        await client.query(
          `UPDATE invoices
              SET stripe_payment_link_url = NULL,
                  stripe_checkout_session_id = NULL,
                  updated_at = NOW()
            WHERE id = $1`,
          [allocation.invoiceId],
        );
      }

      const paymentId = randomUUID();
      const baseAmountCents = sumSafeCents(
        allocations.map((allocation) => allocation.amountCents),
        'statement payment',
      );
      const feeCents = processingFeeCents(baseAmountCents, 'card');
      if (!isSafeCents(feeCents) || !isSafeCents(baseAmountCents + feeCents, { positive: true })) {
        throw new InvoiceLifecycleError('statement payment amount is invalid', 400);
      }
      const invoiceLabels = allocations.map((allocation) => allocation.invoiceNumber).join(', ');

      // Persist the immutable allocation intent before asking Stripe to make
      // it payable. The schema predates a separate "creating" status, so an
      // empty, non-published URL represents the in-transaction placeholder;
      // any provider failure rolls this row back with the transaction.
      await client.query(
        `INSERT INTO statement_payment_sessions (
           id, advertiser_id, checkout_url, invoice_allocations,
           base_amount_cents, processing_fee_cents, status
         ) VALUES ($1, $2, '', $3::jsonb, $4, $5, 'open')`,
        [paymentId, statement.advertiserId, allocationsJson, baseAmountCents, feeCents],
      );

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        customer_email: statement.recipientEmail ?? undefined,
        line_items: [
          {
            price_data: {
              currency: 'usd',
              unit_amount: baseAmountCents,
              product_data: {
                name: `Pay ${allocations.length} overdue invoice${allocations.length === 1 ? '' : 's'}`,
                description: `Caxton Publications invoices: ${invoiceLabels}`.slice(0, 500),
              },
            },
            quantity: 1,
          },
          {
            price_data: {
              currency: 'usd',
              unit_amount: feeCents,
              product_data: {
                name: `${paymentMethodLabel('card')} processing fee`,
                description: 'Processing fee disclosed before payment authorization',
              },
            },
            quantity: 1,
          },
        ],
        success_url: `${APP_BASE_URL}/portal?statement_paid=1`,
        cancel_url: `${APP_BASE_URL}/portal?statement_canceled=1`,
        metadata: {
          source: 'statement_payment',
          statement_payment_id: paymentId,
          advertiser_id: String(statement.advertiserId),
          base_amount_cents: String(baseAmountCents),
          processing_fee_cents: String(feeCents),
          charge_total_cents: String(baseAmountCents + feeCents),
        },
        payment_intent_data: {
          metadata: {
            source: 'statement_payment',
            statement_payment_id: paymentId,
            advertiser_id: String(statement.advertiserId),
            base_amount_cents: String(baseAmountCents),
            processing_fee_cents: String(feeCents),
            charge_total_cents: String(baseAmountCents + feeCents),
            payment_method_selection: 'card',
          },
        },
      });
      createdStripeSessionId = session.id;
      if (!session.url) throw new Error('Stripe did not return a URL for the statement payment');

      await client.query(
        `UPDATE statement_payment_sessions
            SET stripe_checkout_session_id = $2,
                checkout_url = $3,
                expires_at = $4,
                updated_at = NOW()
          WHERE id = $1`,
        [
          paymentId,
          session.id,
          session.url,
          session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
        ],
      );
      return { url: session.url, allocations };
    });

    const allocationById = new Map(result.allocations.map((allocation) => [
      allocation.invoiceId,
      allocation,
    ]));
    const overdueCents = sumSafeCents(
      result.allocations.map((allocation) => allocation.amountCents),
      'statement payment',
    );
    return {
      ...statement,
      overdueCents,
      outstandingCents: overdueCents + statement.notYetDueCents,
      overduePaymentLinkUrl: result.url,
      // The aggregate session invalidated individual links for these invoices;
      // never include the now-stale URLs in the rendered statement.
      invoices: statement.invoices.map((invoice) => {
        const allocation = allocationById.get(invoice.id);
        return allocation
          ? {
              ...invoice,
              amount_paid_cents: Math.max(Number(invoice.total_cents) - allocation.amountCents, 0),
              balance_cents: allocation.amountCents,
              stripe_payment_link_url: null,
              stripe_checkout_session_id: null,
            }
          : invoice;
      }),
    };
  } catch (err) {
    // If the DB insert/commit failed after Stripe accepted the session, do not
    // leave an externally payable session with no allocation record.
    if (createdStripeSessionId) {
      try {
        await stripe.checkout.sessions.expire(createdStripeSessionId);
      } catch {
        // Preserve the original failure; operators can reconcile this Stripe
        // session ID from the preceding provider request logs.
      }
    }
    throw err;
  }
}

export async function refreshPartnerStatementLinks(
  statement: PartnerStatement,
): Promise<PartnerStatement> {
  if (!isStripeConfigured()) throw new Error('Stripe is not configured');
  const stripe = getStripe();

  const invoices: PartnerStatementInvoice[] = [];
  for (const invoice of statement.invoices) {
    let registryId: string | null = null;
    const current = await withNeonTransaction(async (client) => {
      const { invoice: lockedInvoice, remainingCents } = await lockInvoiceRemainingBalance(client, invoice.id);
      const owner = await client.query<{ advertiser_id: number | null; number: string | null }>(
        `SELECT advertiser_id, number FROM invoices WHERE id = $1`,
        [invoice.id],
      );
      if (owner.rows[0]?.advertiser_id !== statement.advertiserId) {
        throw new InvoiceLifecycleError('invoice does not belong to this statement', 400);
      }
      await invalidateInvoiceCheckoutSessions(client, invoice.id);
      const stillOpenStatement = await client.query<{ id: string }>(
        `SELECT id
           FROM statement_payment_sessions
          WHERE status = 'open'
            AND invoice_allocations @> $1::jsonb
          LIMIT 1`,
        [JSON.stringify([{ invoiceId: invoice.id }])],
      );
      if (stillOpenStatement.rows.length > 0) {
        throw new InvoiceLifecycleError(
          'an existing statement checkout could not be safely expired',
          409,
        );
      }
      const registered = await registerInvoiceCheckoutSession(client, {
        invoiceId: invoice.id,
        baseAmountCents: remainingCents,
        createdBy: 'partner-statement',
      });
      registryId = registered.id;
      return {
        amountCents: remainingCents,
        number: owner.rows[0].number ?? invoice.number,
        totalCents: Number(lockedInvoice.total_cents),
      };
    });

    const amountCents = current.amountCents;
    if (!isSafeCents(amountCents, { positive: true })) {
      await withNeonTransaction((client) => markCheckoutSessionFailed(client, registryId as string));
      throw new InvoiceLifecycleError('invoice payment amount is invalid', 400);
    }
    const feeCents = processingFeeCents(amountCents, 'card');
    if (!isSafeCents(feeCents) || !isSafeCents(amountCents + feeCents, { positive: true })) {
      await withNeonTransaction((client) => markCheckoutSessionFailed(client, registryId as string));
      throw new InvoiceLifecycleError('invoice payment amount is invalid', 400);
    }
    let session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        customer_email: statement.recipientEmail ?? undefined,
        line_items: [
          {
            price_data: {
              currency: 'usd',
              unit_amount: amountCents,
              product_data: {
                name: `Invoice ${current.number ?? invoice.id.slice(0, 8)}`,
                description: 'Caxton Publications outstanding invoice balance',
              },
            },
            quantity: 1,
          },
          {
            price_data: {
              currency: 'usd',
              unit_amount: feeCents,
              product_data: {
                name: `${paymentMethodLabel('card')} processing fee`,
                description: 'Processing fee disclosed before payment authorization',
              },
            },
            quantity: 1,
          },
        ],
        success_url: `${APP_BASE_URL}/portal/invoices/${invoice.id}?paid=1`,
        cancel_url: `${APP_BASE_URL}/portal/invoices/${invoice.id}?canceled=1`,
        metadata: {
          source: 'invoice_payment',
          invoice_id: invoice.id,
          invoice_number: current.number ?? '',
          payment_method_selection: 'card',
          base_amount_cents: String(amountCents),
          processing_fee_cents: String(feeCents),
          charge_total_cents: String(amountCents + feeCents),
        },
        payment_intent_data: {
          metadata: {
            source: 'invoice_payment',
            invoice_id: invoice.id,
            invoice_number: current.number ?? '',
            payment_method_selection: 'card',
            base_amount_cents: String(amountCents),
            processing_fee_cents: String(feeCents),
            charge_total_cents: String(amountCents + feeCents),
          },
        },
      });
    } catch (stripeErr) {
      await withNeonTransaction((client) => markCheckoutSessionFailed(client, registryId as string));
      throw stripeErr;
    }
    if (!session.url) {
      await withNeonTransaction((client) => markCheckoutSessionFailed(client, registryId as string));
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch {
        // No URL was published, and the registry is terminal; preserve the
        // actionable provider-response error below.
      }
      throw new Error(`Stripe did not return a URL for invoice ${invoice.number}`);
    }

    await withNeonTransaction(async (client) => {
      await markCheckoutSessionOpen(client, registryId as string, {
        id: session.id,
        url: session.url,
      });
      await client.query(
        `UPDATE invoices
            SET stripe_payment_link_url = $2,
                stripe_checkout_session_id = $3,
                updated_at = NOW()
          WHERE id = $1`,
        [invoice.id, session.url, session.id],
      );
    });
    invoices.push({
      ...invoice,
      number: current.number,
      total_cents: current.totalCents,
      amount_paid_cents: Math.max(current.totalCents - amountCents, 0),
      balance_cents: amountCents,
      stripe_payment_link_url: session.url,
      stripe_checkout_session_id: session.id,
    });
  }

  return getOrCreatePartnerStatementOverdueLink(
    { ...statement, invoices },
    { forceRefresh: true },
  );
}

export function statementMoney(cents: number): string {
  return `$${(Number(cents) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function statementDate(value: string | Date | null): string {
  if (!value) return '-';
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function renderPartnerStatementEmail(
  statement: PartnerStatement,
  personalMessage: string,
): { html: string; text: string } {
  const rowsHtml = statement.invoices
    .map((invoice) => {
      const link = invoice.stripe_payment_link_url;
      return `<tr>
        <td style="padding:11px 8px;border-bottom:1px solid #e5e7eb">${escapeHtml(invoice.number ?? invoice.id.slice(0, 8))}</td>
        <td style="padding:11px 8px;border-bottom:1px solid #e5e7eb">${statementDate(invoice.issued_at)}</td>
        <td style="padding:11px 8px;border-bottom:1px solid #e5e7eb">${statementDate(invoice.due_date)}${invoice.is_overdue ? '<br><span style="color:#dc2626;font-size:11px;font-weight:600">Overdue</span>' : ''}</td>
        <td style="padding:11px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${statementMoney(invoice.total_cents)}</td>
        <td style="padding:11px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${statementMoney(invoice.amount_paid_cents)}</td>
        <td style="padding:11px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${statementMoney(invoice.balance_cents)}</td>
        <td style="padding:11px 8px;border-bottom:1px solid #e5e7eb;text-align:right">
          ${link ? `<a href="${escapeHtml(link)}" style="display:inline-block;background:#ea580c;color:#fff;padding:7px 11px;border-radius:4px;text-decoration:none;font-weight:600;white-space:nowrap">Pay invoice</a>` : ''}
        </td>
      </tr>`;
    })
    .join('');
  const messageHtml = escapeHtml(personalMessage).replaceAll('\n', '<br>');
  const payAllHtml = statement.overduePaymentLinkUrl
    ? `<div style="margin:0 0 22px;padding:16px;background:#fff7ed;border:1px solid #fed7aa;text-align:center">
        <div style="font-size:13px;font-weight:700;color:#9a3412;margin-bottom:10px">Total overdue: ${statementMoney(statement.overdueCents)}</div>
        <a href="${escapeHtml(statement.overduePaymentLinkUrl)}" style="display:inline-block;background:#ea580c;color:#fff;padding:10px 16px;border-radius:4px;text-decoration:none;font-weight:700">Pay all overdue invoices</a>
      </div>`
    : '';

  const html = `<div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;padding:24px;color:#262626;background:#fff">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #d4d4d4;padding-bottom:20px">
      <img src="${APP_BASE_URL}/brand/caxton-logo.jpg" width="112" alt="Caxton Publications Inc." style="height:auto;object-fit:contain">
      <div style="text-align:right;font-size:12px;line-height:1.45">
        <div style="font-size:24px;letter-spacing:.06em;color:#171717">STATEMENT</div>
        <strong>Caxton Publications, Inc.</strong><br>PO Box 81366<br>Austin, Texas 78708-1366<br>United States
      </div>
    </div>
    <div style="font-size:14px;line-height:1.6;padding:22px 0">${messageHtml}</div>
    <div style="display:flex;justify-content:space-between;gap:24px;padding:0 0 22px">
      <div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#737373">Bill to</div><strong>${escapeHtml(statement.billToName)}</strong>${statement.billToAddress ? `<br>${escapeHtml(statement.billToAddress).replaceAll('\n', '<br>')}` : ''}${statement.billToEmail ? `<br>${escapeHtml(statement.billToEmail)}` : ''}</div>
      <div style="text-align:right">United States dollar (USD)<br>As of ${statementDate(statement.asOf)}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:22px;font-size:13px">
      <tr><td style="padding:7px 9px;border-bottom:1px solid #e5e7eb">Overdue</td><td style="padding:7px 9px;border-bottom:1px solid #e5e7eb;text-align:right">${statementMoney(statement.overdueCents)}</td></tr>
      <tr><td style="padding:7px 9px;border-bottom:1px solid #e5e7eb">Not yet due</td><td style="padding:7px 9px;border-bottom:1px solid #e5e7eb;text-align:right">${statementMoney(statement.notYetDueCents)}</td></tr>
      <tr style="background:#f5f5f5;font-weight:700"><td style="padding:10px 9px">Outstanding balance (USD)</td><td style="padding:10px 9px;text-align:right">${statementMoney(statement.outstandingCents)}</td></tr>
    </table>
    ${payAllHtml}
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:#171717;color:#fff">
        <th style="padding:9px 8px;text-align:left">Invoice #</th><th style="padding:9px 8px;text-align:left">Invoice date</th><th style="padding:9px 8px;text-align:left">Due date</th><th style="padding:9px 8px;text-align:right">Total</th><th style="padding:9px 8px;text-align:right">Paid</th><th style="padding:9px 8px;text-align:right">Due</th><th style="padding:9px 8px"></th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div style="margin:18px 0 0 auto;max-width:310px;background:#f5f5f5;padding:12px;font-weight:700;display:flex;justify-content:space-between">
      <span>Outstanding balance (USD)</span><span>${statementMoney(statement.outstandingCents)}</span>
    </div>
    <p style="margin-top:32px;text-align:center;font-size:11px;color:#737373">We appreciate your business.</p>
  </div>`;

  const invoiceText = statement.invoices
    .map(
      (invoice) =>
        `${invoice.number ?? invoice.id.slice(0, 8)} | ${statementDate(invoice.due_date)} | Due ${statementMoney(invoice.balance_cents)}\nPay online: ${invoice.stripe_payment_link_url ?? 'Unavailable'}`,
    )
    .join('\n\n');
  const payAllText = statement.overduePaymentLinkUrl
    ? `\nPay all overdue invoices (${statementMoney(statement.overdueCents)}): ${statement.overduePaymentLinkUrl}\n`
    : '';
  const text = `${personalMessage}\n\nSTATEMENT OF ACCOUNT\n${statement.billToName}\nAs of ${statementDate(statement.asOf)}\n\nOverdue: ${statementMoney(statement.overdueCents)}\nNot yet due: ${statementMoney(statement.notYetDueCents)}\nOutstanding balance (USD): ${statementMoney(statement.outstandingCents)}\n${payAllText}\n${invoiceText}\n\nWe appreciate your business.`;

  return { html, text };
}
