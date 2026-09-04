/**
 * /api/admin/quotes
 *   POST — standalone quote builder. Not tied to an ad inquiry.
 *
 * Body:
 *   {
 *     channel: 'print' | 'email',
 *     package_id: string,
 *     size?: string,       // print
 *     months?: number,     // print
 *     sends?: number,      // email
 *     publication?: 'austin' | 'san_antonio' | 'both',
 *     due_date?: string,
 *     memo?: string,
 *     advertiser:
 *       | { id: number }                                     // existing
 *       | { name: string; contact_email: string;             // new
 *           publication: 'austin' | 'san_antonio' | 'both';
 *           phone?: string; }
 *   }
 *
 * Behavior:
 *   1. Resolve advertiser (load existing or upsert by lower(email))
 *   2. Delegate to draftQuote() — creates agreement + invoice
 *   3. Return { agreement, invoice, advertiser }
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
  draftQuote,
  type DrafterAdvertiser,
} from '@/lib/server/quote-drafter';
import { slugify, generateShareToken } from '@/lib/advertisers';

export const runtime = 'nodejs';

const advertiserExistingSchema = z.object({
  id: z.number().int().positive(),
});
const advertiserNewSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contact_email: z.string().trim().email().max(320),
  publication: z.enum(['austin', 'san_antonio', 'both']),
  phone: z.string().trim().max(40).optional(),
});
const quotesSchema = z
  .object({
    channel: z.enum(['print', 'email', 'app']).optional(),
    package_id: z.string().trim().min(1).max(100).optional(),
    size: z.string().trim().max(40).optional(),
    months: z.number().int().min(1).max(24).optional(),
    sends: z.number().int().min(1).max(24).optional(),
    // App-only fields
    app_cadence: z.enum(['weekly', 'monthly']).optional(),
    app_weeks: z.number().int().min(1).max(52).optional(),
    app_markets: z
      .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
      .optional(),
    publication: z.enum(['austin', 'san_antonio', 'both']).optional(),
    // Optional explicit run window (ISO YYYY-MM-DD). When both supplied,
    // drafter uses them verbatim instead of computing from today.
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    preferred_send_dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(4).optional(),
    // Custom pricing overrides — rep-facing. Server accepts either the
    // full total or a per-unit price (mutually exclusive).
    override_total_cents: z.number().int().min(0).max(100_000_000).optional(),
    override_unit_cents: z.number().int().min(0).max(100_000_000).optional(),
    due_date: z.string().optional(),
    // Bundled multi-line quote. When present, top-level channel/package/qty
  // fields are ignored and the drafter creates one parent agreement +
  // N child rows in agreement_line_items.
  line_items: z.array(z.object({
    channel: z.enum(['print', 'email', 'app']),
    package_id: z.string().min(1),
    size: z.string().optional(),
    months: z.number().int().min(1).max(24).optional(),
    sends: z.number().int().min(1).max(52).optional(),
    app_cadence: z.enum(['weekly', 'monthly']).optional(),
    app_weeks: z.number().int().min(1).max(52).optional(),
    app_markets: z.number().int().min(1).max(4).optional(),
    publication: z.enum(['austin', 'san_antonio', 'both']).optional(),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    override_total_cents: z.number().int().min(0).max(100_000_000).optional(),
    override_unit_cents: z.number().int().min(0).max(100_000_000).optional(),
    // Print-only Insertion Order fields (mirror AgreementDrawer)
    ad_size: z.string().max(40).optional(),
    frequency: z.string().max(10).optional(),
    ad_rate_cents: z.number().int().min(0).max(100_000_000).optional(),
    ad_rate_base_cents: z.number().int().min(0).max(100_000_000).optional(),
    discount_cents: z.number().int().min(0).max(100_000_000).optional(),
    ad_premium_cents: z.number().int().min(0).max(100_000_000).optional(),
    page_position: z.string().max(120).optional(),
    pos_premium_active: z.boolean().optional(),
    ad_timing_months: z.record(z.string(), z.boolean()).optional(),
    ad_timing_years: z.record(z.string(), z.string()).optional(),
    preferred_send_dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(4).optional(),
  })).optional(),
  memo: z.string().max(2000).optional(),
    advertiser: z.union([advertiserExistingSchema, advertiserNewSchema]),
    rep_name: z.string().trim().max(200).optional(),
  })
  .strict()
  .refine(
    (v) => (v.line_items && v.line_items.length > 0) || (v.channel != null && v.package_id != null),
    { message: 'channel and package_id required when line_items is empty' },
  )
  .refine(
    (v) => !(v.override_total_cents != null && v.override_unit_cents != null),
    { message: 'override_total_cents and override_unit_cents are mutually exclusive' },
  )
  .refine(
    (v) => !(v.start_date && v.end_date) || v.end_date >= v.start_date,
    { message: 'end_date must be on or after start_date', path: ['end_date'] },
  );

export const POST = withAdminTracking(async (req: Request) => {
  const admin = await requireAdmin();
  await ensureSchema();

  const body = quotesSchema.parse(await req.json());
  const sql = getSql();

  // ── Resolve advertiser ─────────────────────────────────────────────
  let advertiser: DrafterAdvertiser | null = null;
  let createdNewAdvertiser = false;

  if ('id' in body.advertiser) {
    const rows = (await sql`
      SELECT id, name, contact_email, publication, address, address_2,
             city, state, zip
        FROM advertisers
       WHERE id = ${body.advertiser.id}
       LIMIT 1
    `) as unknown as DrafterAdvertiser[];
    advertiser = rows[0] ?? null;
    if (!advertiser) throw new ApiError(404, 'advertiser_not_found');
  } else {
    // Look up by email first (idempotent — matches public form behavior).
    const existing = (await sql`
      SELECT id, name, contact_email, publication, address, address_2,
             city, state, zip
        FROM advertisers
       WHERE lower(contact_email) = lower(${body.advertiser.contact_email})
       LIMIT 1
    `) as unknown as DrafterAdvertiser[];
    if (existing[0]) {
      advertiser = existing[0];
    } else {
      // Create new — matches POST /api/admin/advertisers slug logic.
      const name = body.advertiser.name.trim();
      const baseSlug = slugify(name) || `advertiser-${Date.now()}`;
      let slug = baseSlug;
      let suffix = 2;
      for (;;) {
        const collide = (await sql`
          SELECT id FROM advertisers WHERE slug = ${slug} LIMIT 1
        `) as unknown as Array<{ id: number }>;
        if (collide.length === 0) break;
        slug = `${baseSlug}-${suffix}`;
        suffix += 1;
        if (suffix > 50) throw new ApiError(500, 'slug_allocation_failed');
      }
      const shareToken = generateShareToken();
      const inserted = (await sql`
        INSERT INTO advertisers (
          name, slug, share_token, contact_email,
          requires_email_gate, publication, status, created_at, updated_at
        ) VALUES (
          ${name}, ${slug}, ${shareToken}, ${body.advertiser.contact_email},
          ${false}, ${body.advertiser.publication}, ${'prospect'}, NOW(), NOW()
        )
        RETURNING id, name, contact_email, publication, address, address_2,
                  city, state, zip
      `) as unknown as DrafterAdvertiser[];
      advertiser = inserted[0] ?? null;
      if (!advertiser) throw new ApiError(500, 'advertiser_create_failed');
      createdNewAdvertiser = true;
    }
  }

  // Optional phone: if we just created the row and the caller supplied
  // a phone, patch it in. Best-effort — advertisers.phone may not exist
  // on older deploys.
  const suppliedPhone =
    !('id' in body.advertiser) && body.advertiser.phone
      ? body.advertiser.phone.trim()
      : null;
  if (createdNewAdvertiser && suppliedPhone) {
    try {
      await sql`UPDATE advertisers SET phone = ${suppliedPhone} WHERE id = ${advertiser.id}`;
    } catch (e) {
      console.error('[quotes POST] phone write failed', e instanceof Error ? e.message : e);
    }
  }

  // ── Draft the quote ────────────────────────────────────────────────
  const result = await draftQuote(advertiser, {
    channel: body.channel,
    package_id: body.package_id,
    size: body.size,
    months: body.months,
    sends: body.sends,
    app_cadence: body.app_cadence,
    app_weeks: body.app_weeks,
    app_markets: body.app_markets,
    override_total_cents: body.override_total_cents,
    override_unit_cents: body.override_unit_cents,
    line_items: body.line_items,
    start_date: body.start_date,
    end_date: body.end_date,
    publication: body.publication,
    due_date: body.due_date,
    memo: body.memo,
    rep_name: body.rep_name ?? null,
    advertiser_phone: suppliedPhone,
    linked_inquiry_id: null,
    actor_email: admin.email ?? null,
  });

  try {
    await logAudit({
      adminId: admin.adminId,
      action: 'quote.drafted',
      entityType: 'agreement',
      entityId: result.agreement.id,
      beforeState: {},
      afterState: {
        advertiser_id: advertiser.id,
        advertiser_created: createdNewAdvertiser,
        invoice_id: result.invoice.id,
        invoice_number: result.invoice.number,
        amount_cents: result.amount_cents,
        package_id: body.package_id,
        channel: body.channel,
      },
    });
  } catch {
    // Audit failures must not block the quote.
  }

  return NextResponse.json(
    {
      agreement: result.agreement,
      invoice: result.invoice,
      advertiser,
      created_new_advertiser: createdNewAdvertiser,
    },
    { status: 201 },
  );
});
