/**
 * /api/admin/ads/inquiries/[id]/quote
 *   POST — draft a quote (agreement + invoice) from an ad inquiry.
 *
 * Body shape varies by channel:
 *   { channel: 'print', package_id: 'brand6',  size: 'Full Page', months?: 1, publication?: 'austin'|'san_antonio'|'both' }
 *   { channel: 'email', package_id: 'e-blastpackageno.1', sends?: 1, publication?: ... }
 *   { channel: 'digital' }  // not currently supported here — digital uses self-serve checkout
 *
 * What it does:
 *   1. Resolves the inquiry + the advertiser created on PR A
 *   2. Builds a line-item from PACKAGES (print) or EBLASTS (email)
 *   3. Creates a draft AGREEMENT (status='draft', linked_inquiry_id=inquiry.id)
 *      — this is what the client signs. Reuses the existing Pressbook
 *      agreement schema so /admin/agreements, the sign wizard, and
 *      the signed-PDF renderer all light up for free.
 *   4. Creates a draft INVOICE tied to that agreement (net-20 for print,
 *      due-immediately for e-Blast / digital) so downstream billing has
 *      the money side already staged.
 *   5. Stamps the inquiry to status='quoted' and appends the agreement +
 *      invoice numbers to internal notes.
 *   6. Returns { agreement, invoice, inquiry } — rep can then hit
 *      /api/admin/agreements/[id]/send to email the client the sign link.
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
import { PACKAGES, EBLASTS, type Package, eblastPriceForPub } from '@/lib/media-kit';
import {
  formatInvoiceNumber,
  type InvoiceLineItem,
  type Invoice,
} from '@/lib/invoices';
import type { Agreement, AgreementType } from '@/lib/agreements';
import { ensureAdvertiserForAgreement } from '@/lib/advertisers-from-agreement';
import { deriveChannelFromAgreementType } from '@/lib/ad-channels';

/**
 * Map inquiry channel + optional print package to an AgreementType. The
 * existing agreements schema uses 'print_ad' | 'eblast' | 'package' etc.
 * A print package with multiple months is a 'package' (bundle); a single
 * print-ad line item is 'print_ad'; e-Blast is 'eblast'.
 */
function agreementTypeFor(
  channel: 'print' | 'email',
  months: number,
): AgreementType {
  if (channel === 'email') return 'eblast';
  return months > 1 ? 'package' : 'print_ad';
}

/**
 * Compute the end date for the agreement / invoice term.
 * Print: start = today, end = today + months*30d rounded to month end.
 * Email: start = end = today (invoice due immediately, sends scheduled).
 */
function computeTerm(
  channel: 'print' | 'email',
  months: number,
): { start_date: string; end_date: string } {
  const now = new Date();
  const startIso = now.toISOString().slice(0, 10);
  if (channel === 'email') {
    return { start_date: startIso, end_date: startIso };
  }
  const end = new Date(now.getFullYear(), now.getMonth() + months, 0);
  const endIso = end.toISOString().slice(0, 10);
  return { start_date: startIso, end_date: endIso };
}

export const runtime = 'nodejs';

// e-Blast IDs are derived the same way as in the public inquiry form:
// lowercase + spaces stripped from the human name.
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
  dbPub: 'austin' | 'san_antonio' | 'both',
): number {
  const mkPub =
    dbPub === 'austin'      ? 'realtyline' as const :
    dbPub === 'san_antonio' ? 'newsline'   as const :
                              'both'       as const;
  return Math.round(eblastPriceForPub(eb, mkPub) * 100);
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
      unit_cents: eblastCentsForDbPub(eb, body.publication ?? inquiryPubToDb(inquiry.publication)),
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

  // ── Create the draft AGREEMENT first ────────────────────────────────
  // This is the client-facing document. Rep will hit
  // /api/admin/agreements/[id]/send afterwards to email the sign link.
  const monthsForTerm = body.channel === 'print' ? (body.months ?? 1) : 1;
  const sendsForTerm = body.channel === 'email' ? (body.sends ?? 1) : 1;
  const agreementType = agreementTypeFor(body.channel, monthsForTerm);
  const { start_date: termStart, end_date: termEnd } = computeTerm(
    body.channel,
    monthsForTerm,
  );

  // For print: ad_size = the specific size (Full Page, Half Page…). For
  // email: eblast_packages is a jsonb[] of package names. Both go on the
  // agreement so the sign wizard and PDF renderer can format them.
  let agAdSize: string | null = null;
  let agFrequency: string | null = null;
  let agEblastPackages: string[] = [];
  if (body.channel === 'print') {
    const pkg = PACKAGES.find((p) => p.id === body.package_id);
    agAdSize = body.size ?? pkg?.sizes[0]?.size ?? null;
    agFrequency = monthsForTerm > 1 ? `${monthsForTerm}x` : '1x';
  } else {
    const eb = EBLASTS.find((e) => eblastId(e.name) === body.package_id);
    agEblastPackages = eb ? [eb.name] : [];
  }

  const agAddress = advertiser.address ?? null;
  const agFullAddress = billToAddress;

  const agRows = (await sql`
    INSERT INTO agreements (
      advertiser_id, company_name, rep_name, advertiser_email,
      advertiser_phone, advertiser_address, type, status,
      start_date, end_date, ad_size, frequency, ad_rate_cents,
      amount_cents, notes, created_by,
      address, city, state, zip,
      billing_email, linked_inquiry_id
    ) VALUES (
      ${advertiser.id},
      ${advertiser.name},
      ${inquiry.name ?? null},
      ${advertiser.contact_email},
      ${inquiry.phone ?? null},
      ${agFullAddress},
      ${agreementType},
      ${'draft'},
      ${termStart},
      ${termEnd},
      ${agAdSize},
      ${agFrequency},
      ${lineItems[0]?.unit_cents ?? null},
      ${amountCents},
      ${memo},
      ${admin.email ?? null},
      ${agAddress},
      ${advertiser.city ?? null},
      ${advertiser.state ?? null},
      ${advertiser.zip ?? null},
      ${advertiser.contact_email},
      ${id}
    )
    RETURNING *
  `) as unknown as Agreement[];

  if (!agRows[0]) throw new ApiError(500, 'agreement_create_failed');
  const agreement = agRows[0];

  // Best-effort: stamp publication + channel + eblast_packages on the
  // agreement. Wrapped so an older Neon deploy missing any of these
  // columns doesn't block the quote.
  try {
    await sql`UPDATE agreements SET publication = ${billPublication} WHERE id = ${agreement.id}`;
    (agreement as { publication?: string }).publication = billPublication;
  } catch (e) {
    console.error('[quote] publication write failed', e instanceof Error ? e.message : e);
  }
  try {
    const ch = deriveChannelFromAgreementType(agreementType);
    await sql`UPDATE agreements SET channel = ${ch} WHERE id = ${agreement.id}`;
    (agreement as { channel?: string }).channel = ch;
  } catch (e) {
    console.error('[quote] channel write failed', e instanceof Error ? e.message : e);
  }
  if (agEblastPackages.length > 0) {
    try {
      await sql`UPDATE agreements SET eblast_packages = ${JSON.stringify(agEblastPackages)}::jsonb WHERE id = ${agreement.id}`;
      (agreement as { eblast_packages?: string[] }).eblast_packages = agEblastPackages;
    } catch (e) {
      console.error('[quote] eblast_packages write failed', e instanceof Error ? e.message : e);
    }
  }

  // Idempotent CRM mirror — same call the /api/admin/agreements POST
  // makes so contacts appear in /admin/advertisers as 'prospect' until
  // signed.
  try {
    await ensureAdvertiserForAgreement(agreement, { desiredStatus: 'prospect' });
  } catch (e) {
    console.error('[quote] ensureAdvertiserForAgreement failed', e instanceof Error ? e.message : e);
  }

  // ── Payment terms per channel ───────────────────────────────────────
  // Print: net-20 monthly (invoiced on the issue month). Explicit
  // due_date left NULL so the existing invoice UI applies its default.
  // Email + Digital: due immediately — set due_date to today.
  const dueDateForChannel =
    body.due_date ??
    (body.channel === 'email' ? new Date().toISOString().slice(0, 10) : null);

  const created = (await sql`
    INSERT INTO invoices (
      advertiser_id, agreement_id, number,
      amount_cents, tax_cents, status,
      issued_at, due_date,
      bill_to_name, bill_to_email, bill_to_address,
      memo, line_items, created_by
    ) VALUES (
      ${advertiser.id},
      ${agreement.id},
      ${number},
      ${amountCents},
      ${0},
      ${'draft'},
      ${null},
      ${dueDateForChannel},
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
  // the inbox detail surface can show "Quoted as INV-XYZ" and jump to
  // the agreement.
  const noteAppendix = `\n[Quoted ${invoice.number ?? invoice.id} · agreement ${agreement.id.slice(0, 8)} · ${descriptionLabel} · $${(amountCents / 100).toFixed(2)} · ${new Date().toISOString().slice(0, 10)}]`;
  const newNotes = (inquiry.notes ?? '').trimEnd() + noteAppendix;
  // Suppress unused warning for sendsForTerm on print-only paths.
  void sendsForTerm;

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
        agreement_id: agreement.id,
        invoice_id: invoice.id,
        invoice_number: invoice.number,
        amount_cents: amountCents,
        package_id: body.package_id,
      },
    });
  } catch {
    // Audit failures must not block the quote.
  }

  return NextResponse.json(
    { agreement, invoice, inquiry: updatedInquiry ?? inquiry },
    { status: 201 },
  );
});

