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
/**
 * Compute the term dates for the agreement / invoice, optionally anchored
 * at an explicit start date. When anchorIso is null, falls back to today
 * (matching legacy computeTerm behavior).
 *   • email → single-day term (send day)
 *   • print → N months, end-of-month
 *   • app   → N weeks (weekly cadence) or N months (monthly cadence)
 */
function computeTermFrom(
  anchorIso: string | null,
  channel: 'print' | 'email' | 'app',
  months: number,
  appCadence?: 'weekly' | 'monthly',
  appWeeks?: number,
): { start_date: string; end_date: string } {
  const startIso =
    anchorIso ?? new Date().toISOString().slice(0, 10);
  const [y, m, d] = startIso.split('-').map(Number);
  if (channel === 'email') {
    return { start_date: startIso, end_date: startIso };
  }
  if (channel === 'app') {
    if (appCadence === 'weekly') {
      const weeks = Math.max(1, appWeeks ?? 1);
      const end = new Date(Date.UTC(y, m - 1, d));
      // exclusive-end: start + weeks*7 - 1 days
      end.setUTCDate(end.getUTCDate() + weeks * 7 - 1);
      return { start_date: startIso, end_date: end.toISOString().slice(0, 10) };
    }
    // Monthly cadence — same as print month math, EOM.
    const end = new Date(Date.UTC(y, m - 1 + Math.max(1, months), 0));
    return { start_date: startIso, end_date: end.toISOString().slice(0, 10) };
  }
  const end = new Date(Date.UTC(y, m - 1 + months, 0));
  return { start_date: startIso, end_date: end.toISOString().slice(0, 10) };
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
  /**
   * Custom pricing override — mutually exclusive with override_unit_cents.
   * When present, replaces the rack-derived total; rack + discount are
   * stamped into memo + line-item description so the paper trail keeps
   * both visible.
   */
  override_total_cents?: number;
  /**
   * Custom per-unit price override — multiplied by the rack qty (months,
   * sends, weeks). Mutually exclusive with override_total_cents.
   */
  override_unit_cents?: number;
  publication?: 'austin' | 'san_antonio' | 'both';
  due_date?: string;
  memo?: string;
  /** Contact info that lives on the agreement (rep-facing). */
  rep_name?: string | null;
  advertiser_phone?: string | null;
  /** Source inquiry id — stamps agreements.linked_inquiry_id. */
  linked_inquiry_id?: string | null;
  /**
   * Optional explicit run window. When both are supplied, the drafter uses
   * them verbatim as agreements.start_date / end_date and skips computeTerm.
   * Format: ISO date 'YYYY-MM-DD'. When only start_date is supplied, end
   * is computed from cadence/qty starting at start_date.
   */
  start_date?: string;
  end_date?: string;
  /** Admin identity for created_by columns + CRM mirror. */
  actor_email: string | null;
}

export interface DrafterResult {
  agreement: Agreement;
  invoice: Invoice;
  amount_cents: number;
  rack_amount_cents: number;
  discount_pct: number;
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

  // ── Rack total (pre-override) ─────────────────────────────────────────
  const rackCents = lineItems.reduce((s, li) => s + li.qty * li.unit_cents, 0);
  if (rackCents <= 0) throw new ApiError(400, 'amount_cents_must_be_positive');

  // ── Apply override, if any ──────────────────────────────────────────
  //   • total  → line_items rewritten to a single line at override_total
  //   • unit   → line_items[0].unit_cents replaced, qty preserved
  // In both cases we append "Rack $X → Quoted $Y (Z% off)" to the memo +
  // to the primary line-item description so the invoice PDF shows both.
  if (
    input.override_total_cents != null &&
    input.override_unit_cents != null
  ) {
    throw new ApiError(400, 'override_total_and_unit_mutually_exclusive');
  }
  let amountCents = rackCents;
  let overrideNote: string | null = null;
  if (input.override_total_cents != null) {
    const ov = Math.max(0, Math.round(input.override_total_cents));
    if (ov > rackCents * 4) {
      // Guardrail: reject absurd "typoed" values (>4× rack).
      throw new ApiError(400, 'override_total_out_of_range');
    }
    amountCents = ov;
    const pct = rackCents > 0 ? Math.round(((rackCents - ov) / rackCents) * 1000) / 10 : 0;
    overrideNote =
      `Rack $${(rackCents / 100).toFixed(2)} → Quoted $${(ov / 100).toFixed(2)} ` +
      `(${pct >= 0 ? pct : 0}% off)`;
    // Collapse to a single custom line so the invoice reads cleanly.
    lineItems.length = 0;
    lineItems.push({
      description: `${descriptionLabel} — custom pricing (${overrideNote})`,
      qty: 1,
      unit_cents: ov,
    });
  } else if (input.override_unit_cents != null) {
    const first = lineItems[0];
    if (!first) throw new ApiError(500, 'line_items_empty');
    const ov = Math.max(0, Math.round(input.override_unit_cents));
    if (ov > first.unit_cents * 4) {
      throw new ApiError(400, 'override_unit_out_of_range');
    }
    const rackUnit = first.unit_cents;
    first.unit_cents = ov;
    amountCents = lineItems.reduce((s, li) => s + li.qty * li.unit_cents, 0);
    const pct = rackUnit > 0 ? Math.round(((rackUnit - ov) / rackUnit) * 1000) / 10 : 0;
    overrideNote =
      `Unit rack $${(rackUnit / 100).toFixed(2)} → quoted $${(ov / 100).toFixed(2)} ` +
      `(${pct >= 0 ? pct : 0}% off)`;
    first.description = `${first.description} — custom unit (${overrideNote})`;
  }
  if (amountCents <= 0) throw new ApiError(400, 'amount_cents_must_be_positive');

  const monthsForTerm =
    input.channel === 'print' || (input.channel === 'app' && (input.app_cadence ?? 'weekly') === 'monthly')
      ? (input.months ?? 1)
      : 1;
  const agreementType = agreementTypeFor(input.channel, monthsForTerm);
  // Explicit run-window support. When the caller supplied both dates, use
  // them verbatim. When only start is supplied, anchor computeTerm at that
  // start (still N units of cadence). Otherwise fall back to today.
  const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
  const explicitStart = input.start_date && ISO_RE.test(input.start_date) ? input.start_date : null;
  const explicitEnd = input.end_date && ISO_RE.test(input.end_date) ? input.end_date : null;
  if (explicitStart && explicitEnd && explicitEnd < explicitStart) {
    throw new ApiError(400, 'end_date_before_start_date');
  }
  let termStart: string;
  let termEnd: string;
  if (explicitStart && explicitEnd) {
    termStart = explicitStart;
    termEnd = explicitEnd;
  } else {
    const t = computeTermFrom(
      explicitStart,
      input.channel,
      monthsForTerm,
      input.channel === 'app' ? (input.app_cadence ?? 'weekly') : undefined,
      input.channel === 'app' ? input.app_weeks : undefined,
    );
    termStart = t.start_date;
    termEnd = t.end_date;
  }

  const billPublication =
    input.publication ?? normalizeAdvertiserPub(advertiser.publication);

  // ── Bill-to strings ──────────────────────────────────────────────────
  const billToAddress =
    [advertiser.address, advertiser.address_2, advertiser.city, advertiser.state, advertiser.zip]
      .filter(Boolean)
      .join(', ') || null;
  const baseMemo =
    input.memo?.trim() ||
    `Quote drafted — ${descriptionLabel}.`;
  const memo = overrideNote
    ? `${baseMemo}\n${overrideNote}`
    : baseMemo;

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

  const discountPct = rackCents > 0
    ? Math.round(((rackCents - amountCents) / rackCents) * 1000) / 10
    : 0;

  return {
    agreement,
    invoice,
    amount_cents: amountCents,
    rack_amount_cents: rackCents,
    discount_pct: discountPct,
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

