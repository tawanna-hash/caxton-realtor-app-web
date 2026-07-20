/**
 * lib/server/quote-drafter.ts
 *
 * Shared helper that turns a channel + package selection + advertiser row
 * into a draft AGREEMENT + draft INVOICE pair. Called by:
 *
 *   - POST /api/admin/ads/inquiries/[id]/quote  (existing — from an inquiry)
 *   - POST /api/admin/quotes                    (new — standalone builder)
 *
 * Extracted so both surfaces share one code path for the actual DB writes,
 * publication stamping, CRM mirror, and payment-terms logic.
 *
 * Reuses the existing Pressbook agreements + invoices schemas — nothing
 * new here schema-wise beyond the `linked_inquiry_id` column added in the
 * 20260720 migration.
 */

import { getSql } from '@/lib/db';
import { ApiError } from '@/lib/server/error';
import {
  PACKAGES,
  EBLASTS,
  APP_AD_SLOTS,
  type Package,
  type AppAdSlot,
  type MarketCount,
  eblastPriceForPub,
  weeklyRateForMarkets,
  monthlyRateForMarkets,
} from '@/lib/media-kit';
import {
  formatInvoiceNumber,
  type InvoiceLineItem,
  type Invoice,
} from '@/lib/invoices';
import type { Agreement, AgreementType } from '@/lib/agreements';
import { ensureAdvertiserForAgreement } from '@/lib/advertisers-from-agreement';
import { deriveChannelFromAgreementType } from '@/lib/ad-channels';

// e-Blast IDs are derived the same way as in the public inquiry form:
// lowercase + spaces stripped from the human name.
export function eblastId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '');
}

/**
 * Resolve the eblast unit price in cents for a database-side publication
 * scope. The database uses 'austin' | 'san_antonio' | 'both'; the media
 * kit data uses 'realtyline' | 'newsline' | 'both'.
 */
export function eblastCentsForDbPub(
  eb: (typeof EBLASTS)[number],
  dbPub: 'austin' | 'san_antonio' | 'both',
): number {
  const mkPub =
    dbPub === 'austin'      ? 'realtyline' as const :
    dbPub === 'san_antonio' ? 'newsline'   as const :
                              'both'       as const;
  return Math.round(eblastPriceForPub(eb, mkPub) * 100);
}

/**
 * Map inquiry channel + optional print package to an AgreementType.
 */
function agreementTypeFor(
  channel: 'print' | 'email' | 'app',
  months: number,
): AgreementType {
  if (channel === 'email') return 'eblast';
  if (channel === 'app') return 'app_ad';
  return months > 1 ? 'package' : 'print_ad';
}

/**
 * Compute the term dates for the agreement / invoice.
 *   • email → single-day term (send day)
 *   • print → N months, end-of-month
 *   • app   → N weeks (weekly cadence) or N months (monthly cadence)
 */
function computeTerm(
  channel: 'print' | 'email' | 'app',
  months: number,
  appCadence?: 'weekly' | 'monthly',
  appWeeks?: number,
): { start_date: string; end_date: string } {
  const now = new Date();
  const startIso = now.toISOString().slice(0, 10);
  if (channel === 'email') {
    return { start_date: startIso, end_date: startIso };
  }
  if (channel === 'app') {
    if (appCadence === 'weekly') {
      const weeks = Math.max(1, appWeeks ?? 1);
      const end = new Date(now);
      // exclusive-end: start + weeks*7 - 1 days
      end.setDate(end.getDate() + weeks * 7 - 1);
      return { start_date: startIso, end_date: end.toISOString().slice(0, 10) };
    }
    // Monthly cadence — same as print month math.
    const end = new Date(now.getFullYear(), now.getMonth() + Math.max(1, months), 0);
    return { start_date: startIso, end_date: end.toISOString().slice(0, 10) };
  }
  const end = new Date(now.getFullYear(), now.getMonth() + months, 0);
  const endIso = end.toISOString().slice(0, 10);
  return { start_date: startIso, end_date: endIso };
}

export interface DrafterAdvertiser {
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

export interface DrafterInput {
  channel: 'print' | 'email' | 'app';
  /**
   * Print: PACKAGES[].id (brand1 / brand3 / …)
   * Email: eblastId(EBLASTS[].name)
   * App:   APP_AD_SLOTS[].slug
   */
  package_id: string;
  size?: string;
  months?: number;
  sends?: number;
  /** App-only: 'weekly' or 'monthly'. Defaults to 'weekly' if omitted. */
  app_cadence?: 'weekly' | 'monthly';
  /** App-only: number of weeks when app_cadence='weekly'. Defaults to 1. */
  app_weeks?: number;
  /** App-only: number of markets 1|2|3|4. Defaults to 1. */
  app_markets?: MarketCount;
  publication?: 'austin' | 'san_antonio' | 'both';
  due_date?: string;
  memo?: string;
  /** Contact info that lives on the agreement (rep-facing). */
  rep_name?: string | null;
  advertiser_phone?: string | null;
  /** Source inquiry id — stamps agreements.linked_inquiry_id. */
  linked_inquiry_id?: string | null;
  /** Admin identity for created_by columns + CRM mirror. */
  actor_email: string | null;
}

export interface DrafterResult {
  agreement: Agreement;
  invoice: Invoice;
  amount_cents: number;
  description_label: string;
  line_items: InvoiceLineItem[];
}

/**
 * Core draft — create agreement (status='draft') + invoice (status='draft')
 * tied to it. Callers are responsible for any surface-specific side effects
 * (updating an inquiry, logging an audit entry, etc.).
 */
export async function draftQuote(
  advertiser: DrafterAdvertiser,
  input: DrafterInput,
): Promise<DrafterResult> {
  const sql = getSql();

  // ── Build line items per channel ─────────────────────────────────────
  const lineItems: InvoiceLineItem[] = [];
  let descriptionLabel = '';
  let agAdSize: string | null = null;
  let agFrequency: string | null = null;
  let agEblastPackages: string[] = [];

  if (input.channel === 'print') {
    const pkg: Package | undefined = PACKAGES.find((p) => p.id === input.package_id);
    if (!pkg) throw new ApiError(400, 'unknown_print_package');
    const size = input.size ?? pkg.sizes[0]?.size;
    const sizeRow = pkg.sizes.find((s) => s.size === size);
    if (!sizeRow) throw new ApiError(400, 'unknown_print_size');
    const months = input.months ?? 1;
    descriptionLabel = `${pkg.name} — ${sizeRow.size} (${sizeRow.dim})`;
    lineItems.push({
      description: `${descriptionLabel}, ${months} month${months > 1 ? 's' : ''}`,
      qty: months,
      unit_cents: sizeRow.price * 100,
    });
    agAdSize = size ?? null;
    agFrequency = months > 1 ? `${months}x` : '1x';
  } else if (input.channel === 'email') {
    const eb = EBLASTS.find((e) => eblastId(e.name) === input.package_id);
    if (!eb) throw new ApiError(400, 'unknown_email_package');
    const sends = input.sends ?? 1;
    descriptionLabel = eb.name;
    const billingPub = input.publication ?? normalizeAdvertiserPub(advertiser.publication);
    lineItems.push({
      description: `${eb.name}${sends > 1 ? `, ${sends} sends` : ''}`,
      qty: sends,
      unit_cents: eblastCentsForDbPub(eb, billingPub),
    });
    agEblastPackages = [eb.name];
  } else {
    // App ad slot — priced by markets × (weekly × weeks) OR (monthly × months).
    const slot: AppAdSlot | undefined = APP_AD_SLOTS.find(
      (s) => s.slug === input.package_id,
    );
    if (!slot) throw new ApiError(400, 'unknown_app_slot');
    const cadence = input.app_cadence ?? 'weekly';
    const markets = (input.app_markets ?? 1) as MarketCount;
    if (![1, 2, 3, 4].includes(markets)) {
      throw new ApiError(400, 'invalid_app_markets');
    }
    if (cadence === 'weekly') {
      const weeks = Math.max(1, input.app_weeks ?? 1);
      const weeklyCents = Math.round(weeklyRateForMarkets(slot, markets) * 100);
      if (weeklyCents <= 0) throw new ApiError(400, 'app_slot_weekly_unavailable');
      descriptionLabel = `${slot.name} — ${markets} market${markets > 1 ? 's' : ''}`;
      lineItems.push({
        description: `${slot.name}, ${weeks} week${weeks > 1 ? 's' : ''} × ${markets} market${markets > 1 ? 's' : ''}`,
        qty: weeks,
        unit_cents: weeklyCents,
      });
      agAdSize = slot.sizes;
      agFrequency = `${weeks}w`;
    } else {
      const months = Math.max(1, input.months ?? 1);
      const monthlyRate = monthlyRateForMarkets(slot, markets);
      if (monthlyRate == null) throw new ApiError(400, 'app_slot_monthly_unavailable');
      const monthlyCents = Math.round(monthlyRate * 100);
      descriptionLabel = `${slot.name} — ${markets} market${markets > 1 ? 's' : ''}`;
      lineItems.push({
        description: `${slot.name}, ${months} month${months > 1 ? 's' : ''} × ${markets} market${markets > 1 ? 's' : ''}`,
        qty: months,
        unit_cents: monthlyCents,
      });
      agAdSize = slot.sizes;
      agFrequency = `${months}mo`;
    }
  }

  const amountCents = lineItems.reduce((s, li) => s + li.qty * li.unit_cents, 0);
  if (amountCents <= 0) throw new ApiError(400, 'amount_cents_must_be_positive');

  const monthsForTerm =
    input.channel === 'print' || (input.channel === 'app' && (input.app_cadence ?? 'weekly') === 'monthly')
      ? (input.months ?? 1)
      : 1;
  const agreementType = agreementTypeFor(input.channel, monthsForTerm);
  const { start_date: termStart, end_date: termEnd } = computeTerm(
    input.channel,
    monthsForTerm,
    input.channel === 'app' ? (input.app_cadence ?? 'weekly') : undefined,
    input.channel === 'app' ? input.app_weeks : undefined,
  );

  const billPublication =
    input.publication ?? normalizeAdvertiserPub(advertiser.publication);

  // ── Bill-to strings ──────────────────────────────────────────────────
  const billToAddress =
    [advertiser.address, advertiser.address_2, advertiser.city, advertiser.state, advertiser.zip]
      .filter(Boolean)
      .join(', ') || null;
  const memo =
    input.memo?.trim() ||
    `Quote drafted — ${descriptionLabel}.`;

  // ── Insert agreement ─────────────────────────────────────────────────
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
      ${input.rep_name ?? null},
      ${advertiser.contact_email},
      ${input.advertiser_phone ?? null},
      ${billToAddress},
      ${agreementType},
      ${'draft'},
      ${termStart},
      ${termEnd},
      ${agAdSize},
      ${agFrequency},
      ${lineItems[0]?.unit_cents ?? null},
      ${amountCents},
      ${memo},
      ${input.actor_email ?? null},
      ${advertiser.address ?? null},
      ${advertiser.city ?? null},
      ${advertiser.state ?? null},
      ${advertiser.zip ?? null},
      ${advertiser.contact_email},
      ${input.linked_inquiry_id ?? null}
    )
    RETURNING *
  `) as unknown as Agreement[];

  if (!agRows[0]) throw new ApiError(500, 'agreement_create_failed');
  const agreement = agRows[0];

  // Best-effort stamps (columns may not exist on older deploys).
  try {
    await sql`UPDATE agreements SET publication = ${billPublication} WHERE id = ${agreement.id}`;
    (agreement as { publication?: string }).publication = billPublication;
  } catch (e) {
    console.error('[quote-drafter] publication write failed', e instanceof Error ? e.message : e);
  }
  try {
    const ch = deriveChannelFromAgreementType(agreementType);
    await sql`UPDATE agreements SET channel = ${ch} WHERE id = ${agreement.id}`;
    (agreement as { channel?: string }).channel = ch;
  } catch (e) {
    console.error('[quote-drafter] channel write failed', e instanceof Error ? e.message : e);
  }
  if (agEblastPackages.length > 0) {
    try {
      await sql`UPDATE agreements SET eblast_packages = ${JSON.stringify(agEblastPackages)}::jsonb WHERE id = ${agreement.id}`;
      (agreement as { eblast_packages?: string[] }).eblast_packages = agEblastPackages;
    } catch (e) {
      console.error('[quote-drafter] eblast_packages write failed', e instanceof Error ? e.message : e);
    }
  }

  // App-slot stamp — best-effort, column may not exist on older deploys.
  if (input.channel === 'app') {
    try {
      await sql`UPDATE agreements SET ad_space_slug = ${input.package_id} WHERE id = ${agreement.id}`;
      (agreement as { ad_space_slug?: string }).ad_space_slug = input.package_id;
    } catch (e) {
      console.error('[quote-drafter] ad_space_slug write failed', e instanceof Error ? e.message : e);
    }
  }

  // CRM mirror — idempotent, best-effort.
  try {
    await ensureAdvertiserForAgreement(agreement, { desiredStatus: 'prospect' });
  } catch (e) {
    console.error('[quote-drafter] ensureAdvertiserForAgreement failed', e instanceof Error ? e.message : e);
  }

  // ── Payment terms ────────────────────────────────────────────────────
  // Print: net-20 monthly (due_date left null so the invoice UI applies
  // its default net-20 rule). E-Blast + App (digital): due immediately.
  const dueDateForChannel =
    input.due_date ??
    (input.channel === 'email' || input.channel === 'app'
      ? new Date().toISOString().slice(0, 10)
      : null);

  // Generate invoice number per publication per year.
  const year = new Date().getFullYear();
  const seqRows = (await sql`
    SELECT count(*)::int AS n
      FROM invoices i
      JOIN advertisers a ON a.id = i.advertiser_id
     WHERE a.publication = ${billPublication}
       AND EXTRACT(YEAR FROM i.created_at) = ${year}
  `) as unknown as Array<{ n: number }>;
  const number = formatInvoiceNumber(billPublication, year, (seqRows[0]?.n ?? 0) + 1);

  // ── Insert invoice tied to agreement ─────────────────────────────────
  const invRows = (await sql`
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
      ${input.actor_email ?? null}
    )
    RETURNING *
  `) as unknown as Invoice[];

  if (!invRows[0]) throw new ApiError(500, 'invoice_create_failed');
  const invoice = invRows[0];

  return {
    agreement,
    invoice,
    amount_cents: amountCents,
    description_label: descriptionLabel,
    line_items: lineItems,
  };
}

/**
 * Advertiser rows use a CSV publication field. For quote pricing we need
 * a single scope value. Falls back to 'austin' if it can't decide.
 */
function normalizeAdvertiserPub(pub: string): 'austin' | 'san_antonio' | 'both' {
  if (!pub) return 'austin';
  const first = pub.split(',')[0]?.trim().toLowerCase();
  if (first === 'san_antonio' || first === 'newsline') return 'san_antonio';
  if (first === 'both') return 'both';
  return 'austin';
}

