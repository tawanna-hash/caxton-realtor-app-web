/**
 * /api/admin/ads/inquiries/[id]/quote
 *   POST — draft a quote (invoice) from an ad inquiry.
 *
 * Body shape varies by channel:
 *   { channel: 'print', package_id: 'brand6',  size: 'Full Page', months?: 1, publication?: 'austin'|'san_antonio'|'both' }
 *   { channel: 'email', package_id: 'e-blastpackageno.1', sends?: 1, publication?: ... }
 *   { channel: 'digital' }  // not currently supported here — digital uses self-serve checkout
 *
 * What it does:
 *   1. Resolves the inquiry + the advertiser created on PR A
 *   2. Builds a line-item from PACKAGES (print) or EBLASTS (email)
 *   3. Creates a draft invoice in the existing `invoices` table
 *   4. Stamps the inquiry to status='quoted' and appends the invoice
 *      number to internal notes so admins can find it from the inbox
 *   5. Returns { invoice, inquiry }
 *
 * Auth: requireAdmin().
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { logAudit } from '@/lib/server/audit';
import { ensureSchema, getSql } from '@/lib/db';
import {
  getAdInquiry,
  updateAdInquiry,
  type AdInquiryRow,
} from '@/lib/server/ad-inquiries-store';
import { PACKAGES, EBLASTS, type Package } from '@/lib/media-kit';
import {
  formatInvoiceNumber,
  type InvoiceLineItem,
  type Invoice,
} from '@/lib/invoices';

export const runtime = 'nodejs';

// e-Blast IDs are derived the same way as in the public inquiry form:
// lowercase + spaces stripped from the human name.
function eblastId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '');
}

const quoteSchema = z
  .object({
    channel: z.enum(['print', 'email']),
    package_id: z.string().trim().min(1).max(100),
    // Print-only:
    size: z.string().trim().max(40).optional(),
    months: z.number().int().min(1).max(24).optional(),
    // Email-only:
    sends: z.number().int().min(1).max(24).optional(),
    // Optional override for the publication scope on the invoice / agreement.
    publication: z.enum(['austin', 'san_antonio', 'both']).optional(),
    due_date: z.string().optional(), // ISO date
    memo: z.string().max(2000).optional(),
  })
  .strict();

/**
 * Map the public `pub` from the inquiry ('realtyline' | 'newsline') to the
 * DB enum used by `advertisers.publication` ('austin' | 'san_antonio').
 * Mirrors `normalizeDbPub()` from /api/checkout/submit so the same row
 * shape ends up in the DB regardless of which surface created it.
 */
function inquiryPubToDb(p: string | null): 'austin' | 'san_antonio' | 'both' {
  if (p === 'newsline' || p === 'san_antonio') return 'san_antonio';
  if (p === 'both') return 'both';
  return 'austin';
}

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
}

export const POST = withErrorHandling(async (
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
      'unsupported_channel: only print and email inquiries support admin quotes',
    );
  }

  const body = quoteSchema.parse(await req.json());
  if (body.channel !== inquiry.channel) {
    throw new ApiError(400, 'channel_mismatch');
  }

  // Resolve advertiser. PR A's insertAdInquiry already upserted one keyed
  // by lower(email) when the public form submitted — fall back to that
  // lookup if the inquiry's advertiser_id is null.
  const sql = getSql();
  let advertiser: AdvertiserRow | null = null;

  if (inquiry.advertiser_id) {
    const rows = (await sql`
      SELECT id, name, contact_email, publication, address, address_2, city, state, zip
        FROM advertisers
       WHERE id = ${inquiry.advertiser_id}
       LIMIT 1
    `) as unknown as AdvertiserRow[];
    advertiser = rows[0] ?? null;
  }
  if (!advertiser) {
    const rows = (await sql`
      SELECT id, name, contact_email, publication, address, address_2, city, state, zip
        FROM advertisers
       WHERE lower(contact_email) = lower(${inquiry.email})
       LIMIT 1
    `) as unknown as AdvertiserRow[];
    advertiser = rows[0] ?? null;
  }
  if (!advertiser) {
    throw new ApiError(
      400,
      'no_advertiser_for_inquiry: create or link an advertiser row before quoting',
    );
  }

  // Build line items per channel.
  const lineItems: InvoiceLineItem[] = [];
  let descriptionLabel = '';

  if (body.channel === 'print') {
    const pkg: Package | undefined = PACKAGES.find((p) => p.id === body.package_id);
    if (!pkg) throw new ApiError(400, 'unknown_print_package');
    const size = body.size ?? pkg.sizes[0]?.size;
    const sizeRow = pkg.sizes.find((s) => s.size === size);
    if (!sizeRow) throw new ApiError(400, 'unknown_print_size');
    const months = body.months ?? 1;
    descriptionLabel = `${pkg.name} — ${sizeRow.size} (${sizeRow.dim})`;
    lineItems.push({
      description: `${descriptionLabel}, ${months} month${months > 1 ? 's' : ''}`,
      qty: months,
      unit_cents: sizeRow.price * 100,
    });
  } else {
    // email
    const eb = EBLASTS.find((e) => eblastId(e.name) === body.package_id);
    if (!eb) throw new ApiError(400, 'unknown_email_package');
    const sends = body.sends ?? 1;
    descriptionLabel = eb.name;
    lineItems.push({
      description: `${eb.name}${sends > 1 ? `, ${sends} sends` : ''}`,
      qty: sends,
      unit_cents: eb.price * 100,
    });
  }

  const amountCents = lineItems.reduce(
    (sum, li) => sum + li.qty * li.unit_cents,
    0,
  );
  if (amountCents <= 0) throw new ApiError(400, 'amount_cents_must_be_positive');

  // Override the advertiser's publication on the bill-to if the caller
  // specified a different scope (e.g. SA-only campaign even though the
  // advertiser's home publication is austin).
  const billPublication = body.publication ?? inquiryPubToDb(inquiry.publication);

  // Generate invoice number per publication per year — same convention
  // as /api/admin/invoices POST.
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
    `Quote drafted from ad inquiry ${id} — ${descriptionLabel}.`;

  const created = (await sql`
    INSERT INTO invoices (
      advertiser_id, agreement_id, number,
      amount_cents, tax_cents, status,
      issued_at, due_date,
      bill_to_name, bill_to_email, bill_to_address,
      memo, line_items, created_by
    ) VALUES (
      ${advertiser.id},
      ${null},
      ${number},
      ${amountCents},
      ${0},
      ${'draft'},
      ${null},
      ${body.due_date ?? null},
      ${advertiser.name},
      ${advertiser.contact_email},
      ${billToAddress},
      ${memo},
      ${JSON.stringify(lineItems)}::jsonb,
      ${admin.email ?? null}
    )
    RETURNING *
  `) as unknown as Invoice[];

  if (!created[0]) throw new ApiError(500, 'invoice_create_failed');
  const invoice = created[0];

  // Stamp the inquiry — move to 'quoted' and append a note pointer so
  // the inbox detail surface can show "Quoted as INV-XYZ".
  const noteAppendix = `\n[Quoted ${invoice.number ?? invoice.id} · ${descriptionLabel} · $${(amountCents / 100).toFixed(2)} · ${new Date().toISOString().slice(0, 10)}]`;
  const newNotes = (inquiry.notes ?? '').trimEnd() + noteAppendix;

  let updatedInquiry: AdInquiryRow | null = inquiry;
  try {
    updatedInquiry = await updateAdInquiry(id, {
      status: 'quoted',
      notes: newNotes,
    });
  } catch {
    // Inquiry update is best-effort — the invoice has already been
    // created, the inbox status can be patched manually if needed.
  }

  try {
    await logAudit({
      adminId: admin.adminId,
      action: 'ad_inquiry.quoted',
      entityType: 'ad_inquiry',
      entityId: id,
      beforeState: { status: inquiry.status, notes: inquiry.notes },
      afterState: {
        status: 'quoted',
        invoice_id: invoice.id,
        invoice_number: invoice.number,
        amount_cents: amountCents,
        package_id: body.package_id,
      },
    });
  } catch {
    // Audit failures must not block the quote.
  }

  return NextResponse.json({ invoice, inquiry: updatedInquiry ?? inquiry }, { status: 201 });
});
