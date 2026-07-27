/**
 * /api/admin/ads/inquiries/[id]/quote
 *   POST — draft a quote (agreement + invoice) from an ad inquiry.
 *
 * Same behavior as before, now delegated to the shared draftQuote()
 * helper in @/lib/server/quote-drafter so the standalone quote builder
 * (/api/admin/quotes) and the inquiry-scoped one share one code path.
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
  getAdInquiry,
  updateAdInquiry,
  type AdInquiryRow,
} from '@/lib/server/ad-inquiries-store';
import {
  draftQuote,
  type DrafterAdvertiser,
} from '@/lib/server/quote-drafter';

export const runtime = 'nodejs';

const quoteSchema = z
  .object({
    channel: z.enum(['print', 'email']),
    package_id: z.string().trim().min(1).max(100),
    size: z.string().trim().max(40).optional(),
    months: z.number().int().min(1).max(24).optional(),
    sends: z.number().int().min(1).max(24).optional(),
    publication: z.enum(['austin', 'san_antonio', 'both']).optional(),
    due_date: z.string().optional(),
    memo: z.string().max(2000).optional(),
  })
  .strict();

/**
 * Map inquiry.publication ('realtyline' | 'newsline' | 'both' | null) to
 * the DB enum. Mirrors normalizeDbPub() in /api/checkout/submit.
 */
function inquiryPubToDb(p: string | null): 'austin' | 'san_antonio' | 'both' {
  if (p === 'newsline' || p === 'san_antonio') return 'san_antonio';
  if (p === 'both') return 'both';
  return 'austin';
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
      'unsupported_channel: only print and email inquiries support admin quotes',
    );
  }

  const body = quoteSchema.parse(await req.json());
  if (body.channel !== inquiry.channel) {
    throw new ApiError(400, 'channel_mismatch');
  }

  // ── Resolve advertiser (from inquiry.advertiser_id or by email) ──────
  const sql = getSql();
  let advertiser: DrafterAdvertiser | null = null;
  if (inquiry.advertiser_id) {
    const rows = (await sql`
      SELECT id, name, contact_email, publication, address, address_2, city, state, zip
        FROM advertisers WHERE id = ${inquiry.advertiser_id} LIMIT 1
    `) as unknown as DrafterAdvertiser[];
    advertiser = rows[0] ?? null;
  }
  if (!advertiser) {
    const rows = (await sql`
      SELECT id, name, contact_email, publication, address, address_2, city, state, zip
        FROM advertisers WHERE lower(contact_email) = lower(${inquiry.email}) LIMIT 1
    `) as unknown as DrafterAdvertiser[];
    advertiser = rows[0] ?? null;
  }
  if (!advertiser) {
    throw new ApiError(
      400,
      'no_advertiser_for_inquiry: create or link an advertiser row before quoting',
    );
  }

  // ── Draft the quote via shared helper ────────────────────────────────
  const result = await draftQuote(advertiser, {
    channel: body.channel,
    package_id: body.package_id,
    size: body.size,
    months: body.months,
    sends: body.sends,
    publication: body.publication ?? inquiryPubToDb(inquiry.publication),
    due_date: body.due_date,
    memo: body.memo,
    rep_name: inquiry.name ?? null,
    advertiser_phone: inquiry.phone ?? null,
    linked_inquiry_id: id,
    actor_email: admin.email ?? null,
  });

  const { agreement, invoice, amount_cents, description_label } = result;

  // ── Stamp the inquiry ────────────────────────────────────────────────
  const noteAppendix = `\n[Quoted ${invoice.number ?? invoice.id} · agreement ${agreement.id.slice(0, 8)} · ${description_label} · $${(amount_cents / 100).toFixed(2)} · ${new Date().toISOString().slice(0, 10)}]`;
  const newNotes = (inquiry.notes ?? '').trimEnd() + noteAppendix;

  let updatedInquiry: AdInquiryRow | null = inquiry;
  try {
    updatedInquiry = await updateAdInquiry(id, {
      status: 'quoted',
      notes: newNotes,
    });
  } catch {
    // best-effort
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
        amount_cents,
        package_id: body.package_id,
      },
    });
  } catch {
    // best-effort
  }

  return NextResponse.json(
    { agreement, invoice, inquiry: updatedInquiry ?? inquiry },
    { status: 201 },
  );
});

