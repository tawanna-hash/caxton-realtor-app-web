// lib/server/invoice-email.ts
//
// Shared "email an invoice to the payer" primitive.
//
// This is the logic that used to live inline inside
// app/api/admin/invoices/[id]/payment-link/route.ts. It:
//   1. Mints a single-use `pay_invoice` portal magic link for the advertiser
//      (portal_magic_links) pointing at /portal/consume?token=...
//   2. Sends the invoice (or reminder) email through Resend, using the
//      per-domain Resend key that owns the From address.
//   3. Bumps invoices.last_reminder_sent_at / reminder_count — reminder mode
//      only, and only after a successful send (matching the original route
//      behavior exactly).
//
// Callers: the admin payment-link route (manual "Send payment link") and the
// recurring-invoice generation engine (auto_send schedules).
//
// IMPORTANT: this performs network I/O (Resend) plus a DB write, so it must
// never be called from inside an open DB transaction/savepoint — a rollback
// must not be able to "undo" an email that has already left the building.
// That is why it takes the pooled tagged-template `sql` client (or defaults to
// getSql()) rather than a PoolClient bound to a live transaction.

import { Resend } from 'resend';
import { getSql } from '@/lib/db';
import {
  generateMagicLinkToken,
  hashMagicLinkToken,
  PORTAL_LINK_TTL_MS,
} from '@/lib/portal';
import {
  EMAIL_SENDERS,
  getResendApiKeyForFrom,
  type EmailSenderAddress,
} from '@/lib/email-sender';
import { senderAddressForPublication } from '@/lib/invoice-sender-routing';

type Sql = ReturnType<typeof getSql>;

/** Public app origin used for portal links and email image assets. */
export const APP_BASE_URL = process.env.APP_BASE_URL ?? 'https://app.myrealtyline.com';

export type InvoiceEmailStatus = 'sent' | 'skipped' | 'failed' | 'no_advertiser' | 'no_email';

export interface SendInvoiceEmailParams {
  /**
   * Tagged-template Neon client. Optional: defaults to getSql(). Never pass a
   * transaction-bound PoolClient — see the module note above.
   */
  sql?: Sql;
  invoiceId: string;
  invoiceNumber: string;
  advertiserId: number | null;
  billToName: string | null;
  /** Recipient. Callers may pass an explicit override instead of bill_to_email. */
  billToEmail: string | null;
  balanceCents: number;
  /**
   * The advertiser's `advertisers.publication` value (single key or CSV).
   * Used to route the From address to the right verified domain:
   * San Antonio → newslinesa.com, every RealtyLine market → myrealtyline.com.
   * Callers should pass this from the advertiser row they already have; when
   * omitted or null it safely defaults to the RealtyLine sender.
   */
  publication?: string | null;
  /**
   * Explicit From override (e.g. the admin picked an address in the send
   * dialog). Always wins over publication-based routing.
   */
  sender?: EmailSenderAddress;
  /** Overrides the generated subject line. */
  subject?: string;
  /** Replaces the default body copy when non-empty. */
  customMessage?: string;
  reminder?: boolean;
  /** portal_magic_links.created_by — admin email, or 'recurring-schedule' from the cron. */
  createdBy?: string | null;
}

export interface SendInvoiceEmailResult {
  status: InvoiceEmailStatus;
  error?: string;
  messageId?: string;
  /** Set as soon as the magic link exists, even if the send is skipped/failed. */
  consumeUrl?: string;
}

/**
 * Create a portal pay link and email it. Never throws for provider failures:
 * the outcome is always reported through the returned status so that callers
 * (invoice creation, recurring sweep) are never blocked by a side effect.
 *
 * Status semantics, preserved from the original payment-link route:
 *   no_advertiser — invoice has no advertiser_id, so no portal link is possible
 *   no_email      — no recipient address available
 *   skipped       — no Resend API key configured for the chosen From domain
 *   failed        — Resend rejected the send (see `error`)
 *   sent          — Resend accepted and returned a message id
 */
export async function sendInvoiceEmail(
  params: SendInvoiceEmailParams,
): Promise<SendInvoiceEmailResult> {
  const sql = params.sql ?? getSql();
  const reminder = params.reminder === true;

  if (!params.advertiserId) return { status: 'no_advertiser' };

  const sendTo = params.billToEmail?.trim() ? params.billToEmail.trim() : null;
  if (!sendTo) return { status: 'no_email' };

  const raw = generateMagicLinkToken();
  const tokenHash = hashMagicLinkToken(raw);
  const linkExpires = new Date(Date.now() + PORTAL_LINK_TTL_MS).toISOString();
  await sql`
    INSERT INTO portal_magic_links (advertiser_id, token_hash, purpose, link_expires_at, sent_to_email, created_by, entity_id)
    VALUES (${params.advertiserId}, ${tokenHash}, 'pay_invoice', ${linkExpires}, ${sendTo}, ${params.createdBy ?? null}, ${params.invoiceId})
  `;
  const consumeUrl = `${APP_BASE_URL}/portal/consume?token=${encodeURIComponent(raw)}`;

  // An explicit caller-supplied sender always wins (admin "send from" UI);
  // otherwise route by the partner's publication/market.
  const sender: EmailSenderAddress = params.sender
    ?? senderAddressForPublication(params.publication);
  const resendApiKey = getResendApiKeyForFrom(sender);
  if (!resendApiKey) return { status: 'skipped', consumeUrl };

  const subject = params.subject?.trim()
    ? params.subject.trim()
    : reminder
      ? `Reminder: Invoice ${params.invoiceNumber} from Caxton Publications is due`
      : `Invoice ${params.invoiceNumber} from Caxton Publications`;
  const customMessage = params.customMessage?.trim() ?? '';
  const templateProps = {
    name: params.billToName ?? 'there',
    number: params.invoiceNumber,
    consumeUrl,
    amountCents: params.balanceCents,
    customMessage,
    reminder,
  };

  try {
    const resend = new Resend(resendApiKey);
    const { data: resendData, error: resendError } = await resend.emails.send({
      from: EMAIL_SENDERS[sender],
      replyTo: sender,
      to: sendTo,
      subject,
      html: invoiceEmailHtml(templateProps),
      text: invoiceEmailText(templateProps),
    });
    if (resendError) {
      throw new Error(resendError.message || 'Resend rejected the email.');
    }
    if (!resendData?.id) {
      throw new Error('Resend accepted the request without returning a message ID.');
    }
    if (reminder) {
      await sql`
        UPDATE invoices
        SET last_reminder_sent_at = NOW(),
            reminder_count = COALESCE(reminder_count, 0) + 1,
            updated_at = NOW()
        WHERE id = ${params.invoiceId}
      `;
    }
    return { status: 'sent', messageId: resendData.id, consumeUrl };
  } catch (err) {
    console.error('[invoice-email] send failed', err);
    return {
      status: 'failed',
      error: err instanceof Error ? err.message : 'Unknown email provider error.',
      consumeUrl,
    };
  }
}

interface InvoiceEmailTemplateProps {
  name: string;
  number: string;
  consumeUrl: string;
  amountCents: number;
  customMessage: string;
  reminder: boolean;
}

export function invoiceEmailText({
  name,
  number,
  consumeUrl,
  amountCents,
  customMessage,
  reminder,
}: InvoiceEmailTemplateProps): string {
  if (customMessage) {
    return [
      customMessage,
      '',
      `Balance due: ${formatEmailCents(amountCents)}`,
      '',
      consumeUrl,
      '',
      'This link is valid for 24 hours and may only be used once.',
    ].join('\n');
  }

  return [
    `Dear ${name},`,
    '',
    reminder
      ? `This is a reminder that invoice ${number} has not been paid. If you have any questions, please reach out to our office.`
      : `We appreciate your business. Your invoice ${number} is ready to review and pay.`,
    '',
    `Balance due: ${formatEmailCents(amountCents)}`,
    '',
    consumeUrl,
    '',
    'This link is valid for 24 hours and may only be used once.',
    '',
    'Sincerely,',
    'Caxton Publications Inc.',
  ].join('\n');
}

export function invoiceEmailHtml({
  name,
  number,
  consumeUrl,
  amountCents,
  customMessage,
  reminder,
}: InvoiceEmailTemplateProps): string {
  const message = customMessage || (reminder
    ? `This is a reminder that invoice ${number} has not been paid. If you have any questions, please reach out to our office.`
    : `We appreciate your business. Your invoice ${number} is ready to review and pay.`);
  const greeting = customMessage
    ? ''
    : `<p style="font-size:15px;line-height:1.6">Dear ${escapeEmailHtml(name)},</p>`;
  const closing = customMessage
    ? ''
    : '<p style="font-size:14px;line-height:1.6">Sincerely,<br><strong>Caxton Publications Inc.</strong></p>';
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#202124;background:#fff">
    <div style="text-align:center;padding:12px 0 24px">
      <img src="${APP_BASE_URL}/brand/caxton-logo.jpg" width="125" alt="Caxton Publications Inc." style="display:inline-block;max-height:105px;object-fit:contain">
    </div>
    <div style="background:#eef6fb;padding:28px;text-align:center">
      <h2 style="font-size:24px;margin:0 0 18px">${reminder ? 'Payment reminder' : 'Your invoice is ready!'}</h2>
      <div style="font-size:11px;color:#667085;text-transform:uppercase;letter-spacing:.08em">Balance due</div>
      <div style="font-size:38px;font-weight:600;margin-top:4px">${formatEmailCents(amountCents)}</div>
    </div>
    <div style="padding:28px 12px">
      ${greeting}
      <p style="font-size:15px;line-height:1.6;white-space:pre-line">${escapeEmailHtml(message)}</p>
      <p style="margin:26px 0;text-align:center">
      <a href="${consumeUrl}" style="display:inline-block;background:#ea580c;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600">
        View &amp; pay invoice ${escapeEmailHtml(number)}
      </a>
      </p>
      <p style="font-size:13px;color:#667085">This secure link is valid for 24 hours and may only be used once.</p>
      ${closing}
    </div>
  </div>`;
}

function formatEmailCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function escapeEmailHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
