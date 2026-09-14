import { ensureSchema, getSql } from '@/lib/db';
import { paymentMethodLabel, processingFeeCents } from '@/lib/payment-processing-fees';
import { getStripe, isStripeConfigured } from '@/lib/stripe';

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
  invoices: PartnerStatementInvoice[];
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
    invoices,
  };
}

export async function refreshPartnerStatementLinks(
  statement: PartnerStatement,
): Promise<PartnerStatement> {
  if (!isStripeConfigured()) throw new Error('Stripe is not configured');
  const stripe = getStripe();
  const sql = getSql();

  const invoices: PartnerStatementInvoice[] = [];
  for (const invoice of statement.invoices) {
    if (invoice.stripe_checkout_session_id) {
      try {
        await stripe.checkout.sessions.expire(invoice.stripe_checkout_session_id);
      } catch {
        // Completed and already-expired Checkout Sessions cannot be expired again.
      }
    }

    const amountCents = Number(invoice.balance_cents);
    const feeCents = processingFeeCents(amountCents, 'card');
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: statement.recipientEmail ?? undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: {
              name: `Invoice ${invoice.number ?? invoice.id.slice(0, 8)}`,
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
        invoice_number: invoice.number ?? '',
        payment_method_selection: 'card',
        base_amount_cents: String(amountCents),
        processing_fee_cents: String(feeCents),
        charge_total_cents: String(amountCents + feeCents),
      },
      payment_intent_data: {
        metadata: {
          source: 'invoice_payment',
          invoice_id: invoice.id,
          invoice_number: invoice.number ?? '',
          payment_method_selection: 'card',
          base_amount_cents: String(amountCents),
          processing_fee_cents: String(feeCents),
          charge_total_cents: String(amountCents + feeCents),
        },
      },
    });
    if (!session.url) throw new Error(`Stripe did not return a URL for invoice ${invoice.number}`);

    await sql`
      UPDATE invoices
      SET stripe_payment_link_url = ${session.url},
          stripe_checkout_session_id = ${session.id},
          updated_at = NOW()
      WHERE id = ${invoice.id}
    `;
    invoices.push({
      ...invoice,
      stripe_payment_link_url: session.url,
      stripe_checkout_session_id: session.id,
    });
  }

  return { ...statement, invoices };
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
  const text = `${personalMessage}\n\nSTATEMENT OF ACCOUNT\n${statement.billToName}\nAs of ${statementDate(statement.asOf)}\n\nOverdue: ${statementMoney(statement.overdueCents)}\nNot yet due: ${statementMoney(statement.notYetDueCents)}\nOutstanding balance (USD): ${statementMoney(statement.outstandingCents)}\n\n${invoiceText}\n\nWe appreciate your business.`;

  return { html, text };
}
