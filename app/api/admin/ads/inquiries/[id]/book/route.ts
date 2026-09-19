/**
 * /api/admin/ads/inquiries/[id]/book
 *   POST — Convert an inquiry directly into a booked order (skip quote step).
 *
 * Use case: an admin took the call, agreed terms verbally, and now wants
 * to spin up the agreement + invoice in one shot. Optionally attaches a
 * Stripe payment link URL the admin pasted, or marks payment_mode as
 * 'invoice' / 'check' for manual collection.
 *
 * Body shape:
 *   {
 *     channel:           'print' | 'email',
 *     package_id:        string,
 *     size?:             string,             // print only
 *     months?:           number,             // print only (1..24)
 *     sends?:            number,             // email only (1..24)
 *     start_date:        'YYYY-MM-DD',
 *     end_date:          'YYYY-MM-DD',
 *     publication?:      'austin'|'san_antonio'|'both',
 *     payment_mode?:     'card'|'link'|'invoice'|'check',
 *     stripe_payment_link_url?: string,
 *     memo?:             string,
 *     create_invoice?:   boolean,            // default true
 *   }
 *
 * Side effects:
 *   1. INSERT agreements row (status='sent' if stripe link present, else 'signed')
 *   2. Optionally INSERT invoices row, linked to the agreement
 *   3. Stamp inquiry to status='won' + append a [Booked …] note
 *   4. Audit log
 *
 * Auth: requireAdmin().
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { logAudit } from '@/lib/server/audit';
import { ensureSchema, getSql } from '@/lib/db';
import {
  PUBLICATION_IDS,
  publicationToPubId,
  type PublicationScope,
} from '@/lib/publications';
import {
  getAdInquiry,
  updateAdInquiry,
  type AdInquiryRow,
} from '@/lib/server/ad-inquiries-store';
import { PACKAGES, EBLASTS, type Package, eblastPriceForPub } from '@/lib/media-kit';
import { formatInvoiceNumber, type InvoiceLineItem } from '@/lib/invoices';

export const runtime = 'nodejs';

function eblastId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '');
}

/**
 * Resolve the eblast unit price in cents for a database-side publication
 * scope. The database uses 'austin' | 'san_antonio' | 'both'; the media
 * kit data uses 'realtyline' | 'newsline' | 'both'. Bundle price is a
 * 10%-off pre-computed value on priceByPub.both — no runtime discount.
 */
function eblastCentsForDbPub(
  eb: (typeof EBLASTS)[number],
  dbPub: PublicationScope,
): number {
  const mkPub = dbPub === 'both' ? 'both' : publicationToPubId(dbPub);
  return Math.round(eblastPriceForPub(eb, mkPub) * 100);
}


function inquiryPubToDb(p: string | null): PublicationScope {
  if (p === 'newsline' || p === 'san_antonio') return 'san_antonio';
  if (p === 'realtyline-houston' || p === 'houston') return 'houston';
  if (p === 'realtyline-dallas' || p === 'dallas') return 'dallas';
  if (p === 'both') return 'both';
  return 'austin';
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const bookSchema = z
  .object({
    channel: z.enum(['print', 'email']),
    package_id: z.string().trim().min(1).max(100),
    size: z.string().trim().max(40).optional(),
    months: z.number().int().min(1).max(24).optional(),
    sends: z.number().int().min(1).max(24).optional(),
    start_date: z.string().regex(ISO_DATE, 'start_date must be YYYY-MM-DD'),
    end_date: z.string().regex(ISO_DATE, 'end_date must be YYYY-MM-DD'),
    publication: z.enum([...PUBLICATION_IDS, 'both']).optional(),
    payment_mode: z.enum(['card', 'link', 'invoice', 'check']).optional(),
    stripe_payment_link_url: z.string().url().optional(),
    memo: z.string().max(2000).optional(),
    create_invoice: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.end_date >= v.start_date, {
    message: 'end_date must be >= start_date',
    path: ['end_date'],
  });

interface AdvertiserRow {
  id: number;
  name: string;
  contact_email: string | null;
  publication: string;
  address: string | null;
  address_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
}

interface AgreementInsertResult {
  id: string;
  status: string;
  amount_cents: number | null;
  stripe_payment_link_url: string | null;
  created_at: string;
}

interface InvoiceRow {
  id: string;
  number: string | null;
  amount_cents: number | null;
}

export const POST = withAdminTracking(async (
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  const admin = await requireAdmin();
  await ensureSchema();
  const { id } = await ctx.params;

  const inquiry = await getAdInquiry(id);
  if (!inquiry) throw new ApiError(404, 'inquiry_not_found');
  if (inquiry.channel !== 'print' && inquiry.channel !== 'email') {
    throw new ApiError(
      400,
      'unsupported_channel: only print and email inquiries can be booked here; digital uses self-serve checkout',
    );
  }

  const body = bookSchema.parse(await req.json());
  if (body.channel !== inquiry.channel) {
    throw new ApiError(400, 'channel_mismatch');
  }

  // Resolve advertiser (mirrors quote flow exactly).
  const sql = getSql();
  let advertiser: AdvertiserRow | null = null;

  if (inquiry.advertiser_id) {
    const rows = (await sql`
      SELECT id, name, contact_email, publication, address, address_2, city, state, zip, phone
        FROM advertisers
       WHERE id = ${inquiry.advertiser_id}
       LIMIT 1
    `) as unknown as AdvertiserRow[];
    advertiser = rows[0] ?? null;
  }
  if (!advertiser) {
    const rows = (await sql`
      SELECT id, name, contact_email, publication, address, address_2, city, state, zip, phone
        FROM advertisers
       WHERE lower(contact_email) = lower(${inquiry.email})
       LIMIT 1
    `) as unknown as AdvertiserRow[];
    advertiser = rows[0] ?? null;
  }
  if (!advertiser) {
    throw new ApiError(
      400,
      'no_advertiser_for_inquiry: create or link an advertiser row before booking',
    );
  }

  // Build line items + description (same logic as quote endpoint).
  const lineItems: InvoiceLineItem[] = [];
  let descriptionLabel = '';
  let adSize: string | null = null;
  let frequency: string | null = null;

  if (body.channel === 'print') {
    const pkg: Package | undefined = PACKAGES.find((p) => p.id === body.package_id);
    if (!pkg) throw new ApiError(400, 'unknown_print_package');
    const size = body.size ?? pkg.sizes[0]?.size;
    const sizeRow = pkg.sizes.find((s) => s.size === size);
    if (!sizeRow) throw new ApiError(400, 'unknown_print_size');
    const months = body.months ?? 1;
    adSize = sizeRow.size;
    frequency = `${months}x`;
    descriptionLabel = `${pkg.name} — ${sizeRow.size} (${sizeRow.dim})`;
    lineItems.push({
      description: `${descriptionLabel}, ${months} month${months > 1 ? 's' : ''}`,
      qty: months,
      unit_cents: sizeRow.price * 100,
    });
  } else {
    const eb = EBLASTS.find((e) => eblastId(e.name) === body.package_id);
    if (!eb) throw new ApiError(400, 'unknown_email_package');
    const sends = body.sends ?? 1;
    adSize = eb.name;
    frequency = `${sends} send${sends > 1 ? 's' : ''}`;
    descriptionLabel = eb.name;
    lineItems.push({
      description: `${eb.name}${sends > 1 ? `, ${sends} sends` : ''}`,
      qty: sends,
      unit_cents: eblastCentsForDbPub(eb, body.publication ?? inquiryPubToDb(inquiry.publication)),
    });
  }

  const amountCents = lineItems.reduce(
    (sum, li) => sum + li.qty * li.unit_cents,
    0,
  );
  if (amountCents <= 0) throw new ApiError(400, 'amount_cents_must_be_positive');

  const billPublication = body.publication ?? inquiryPubToDb(inquiry.publication);

  // Determine agreement status:
  //   - If admin pasted a Stripe payment link → 'sent' (awaiting payment)
  //   - If marked card/check/invoice w/ no link → 'signed' (confirmed verbally)
  const agreementStatus = body.stripe_payment_link_url ? 'sent' : 'signed';
  const paymentMode = body.payment_mode ?? (body.stripe_payment_link_url ? 'link' : 'invoice');

  // ── INSERT agreement ────────────────────────────────────────────────
  const agreementRows = (await sql`
    INSERT INTO agreements (
      advertiser_id, company_name, advertiser_email, advertiser_phone,
      type, status, channel,
      start_date, end_date, ad_size, frequency, amount_cents,
      payment_mode, stripe_payment_link_url,
      notes, created_by
    ) VALUES (
      ${advertiser.id},
      ${advertiser.name},
      ${advertiser.contact_email},
      ${advertiser.phone},
      ${body.channel},
      ${agreementStatus},
      ${body.channel},
      ${body.start_date},
      ${body.end_date},
      ${adSize},
      ${frequency},
      ${amountCents},
      ${paymentMode},
      ${body.stripe_payment_link_url ?? null},
      ${body.memo?.trim() || `Booked from ad inquiry ${id} — ${descriptionLabel}.`},
      ${admin.email ?? null}
    )
    RETURNING id, status, amount_cents, stripe_payment_link_url, created_at
  `) as unknown as AgreementInsertResult[];

  const agreement = agreementRows[0];
  if (!agreement) throw new ApiError(500, 'agreement_create_failed');

  // ── INSERT invoice (optional, default true) ────────────────────────
  let invoice: InvoiceRow | null = null;
  if (body.create_invoice !== false) {
    const year = new Date().getFullYear();
    const seqRows = (await sql`
      SELECT count(*)::int AS n
        FROM invoices i
        JOIN advertisers a ON a.id = i.advertiser_id
       WHERE a.publication = ${billPublication}
         AND EXTRACT(YEAR FROM i.created_at) = ${year}
    `) as unknown as Array<{ n: number }>;
    const number = formatInvoiceNumber(billPublication, year, (seqRows[0]?.n ?? 0) + 1);

    const billToAddress =
      [advertiser.address, advertiser.address_2, advertiser.city, advertiser.state, advertiser.zip]
        .filter(Boolean)
        .join(', ') || null;

    const memo =
      body.memo?.trim() ||
      `Booked from ad inquiry ${id} — ${descriptionLabel}.`;

    // If a Stripe link was attached, the invoice is 'sent'; otherwise draft.
    const invoiceStatus = body.stripe_payment_link_url ? 'sent' : 'draft';

    const invoiceRows = (await sql`
      INSERT INTO invoices (
        advertiser_id, agreement_id, number,
        amount_cents, tax_cents, status,
        issued_at, due_date,
        bill_to_name, bill_to_email, bill_to_address,
        memo, line_items, created_by,
        stripe_payment_link_url
      ) VALUES (
        ${advertiser.id},
        ${agreement.id},
        ${number},
        ${amountCents},
        ${0},
        ${invoiceStatus},
        ${body.stripe_payment_link_url ? new Date().toISOString() : null},
        ${null},
        ${advertiser.name},
        ${advertiser.contact_email},
        ${billToAddress},
        ${memo},
        ${JSON.stringify(lineItems)}::jsonb,
        ${admin.email ?? null},
        ${body.stripe_payment_link_url ?? null}
      )
      RETURNING id, number, amount_cents
    `) as unknown as InvoiceRow[];
    invoice = invoiceRows[0] ?? null;
  }

  // ── Stamp the inquiry ─────────────────────────────────────────────
  const bookedNote = `\n[Booked ${new Date().toISOString().slice(0, 10)} · ${descriptionLabel} · $${(amountCents / 100).toFixed(2)} · agreement ${agreement.id}${invoice?.number ? ` · invoice ${invoice.number}` : ''}]`;
  const newNotes = (inquiry.notes ?? '').trimEnd() + bookedNote;

  let updatedInquiry: AdInquiryRow | null = inquiry;
  try {
    updatedInquiry = await updateAdInquiry(id, {
      status: 'won',
      notes: newNotes,
    });
  } catch {
    // Inquiry stamp is best-effort.
  }

  try {
    await logAudit({
      adminId: admin.adminId,
      action: 'ad_inquiry.booked',
      entityType: 'ad_inquiry',
      entityId: id,
      beforeState: { status: inquiry.status },
      afterState: {
        status: 'won',
        agreement_id: agreement.id,
        invoice_id: invoice?.id ?? null,
        invoice_number: invoice?.number ?? null,
        amount_cents: amountCents,
        channel: body.channel,
        package_id: body.package_id,
        payment_mode: paymentMode,
      },
    });
  } catch {
    // Audit failures must not block the booking.
  }

  return NextResponse.json(
    { agreement, invoice, inquiry: updatedInquiry ?? inquiry },
    { status: 201 },
  );
});
