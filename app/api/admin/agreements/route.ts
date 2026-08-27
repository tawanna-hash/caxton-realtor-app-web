// app/api/admin/agreements/route.ts
//
// GET  — list all agreements, with advertiser name + invoice totals
// POST — create a new agreement (draft by default)

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import {
  AGREEMENT_STATUS_VALUES,
  AGREEMENT_TYPE_VALUES,
  AGREEMENT_PUBLICATION_VALUES,
  PAYMENT_MODE_VALUES,
  type AgreementWithAdvertiser,
} from '@/lib/agreements';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { ensureAdvertiserForAgreement } from '@/lib/advertisers-from-agreement';
import { syncAgreementToAdvertiser } from '@/lib/server/billing-crm-sync';
import { deriveChannelFromAgreementType } from '@/lib/ad-channels';
import type { Agreement } from '@/lib/agreements';
import { captureServerEvent, flushServerEvents } from '@/lib/server/posthog';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await ensureSchema();
    const sql = getSql();
    // Use a single LEFT JOIN to invoices with conditional SUMs instead of
    // two correlated subqueries per agreement row (which were running N*2
    // extra scans of the invoices table). Same output shape, far fewer
    // round trips on the planner side.
    const rows = (await sql`
      SELECT
        ag.*,
        adv.name AS advertiser_name,
        COALESCE(inv.invoiced_cents, 0)::int AS invoiced_cents,
        COALESCE(inv.paid_cents, 0)::int     AS paid_cents
      FROM agreements ag
      LEFT JOIN advertisers adv ON adv.id = ag.advertiser_id
      LEFT JOIN (
        SELECT
          agreement_id,
          SUM(CASE WHEN status <> 'void' THEN total_cents ELSE 0 END) AS invoiced_cents,
          SUM(CASE WHEN status = 'paid'  THEN total_cents ELSE 0 END) AS paid_cents
        FROM invoices
        GROUP BY agreement_id
      ) inv ON inv.agreement_id = ag.id
      ORDER BY ag.updated_at DESC
    `) as unknown as AgreementWithAdvertiser[];
    return NextResponse.json({ agreements: rows });
  } catch (err) {
    console.error('[admin/agreements GET]', errMessage(err));
    return NextResponse.json({ error: 'list failed', detail: errMessage(err) }, { status: 500 });
  }
}

export const POST = withAdminTracking(async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const advertiserId = typeof body.advertiser_id === 'number' ? body.advertiser_id : null;
  const status = typeof body.status === 'string' && AGREEMENT_STATUS_VALUES.has(body.status as never)
    ? (body.status as string) : 'draft';
  const type = typeof body.type === 'string' && AGREEMENT_TYPE_VALUES.has(body.type as never)
    ? (body.type as string) : null;
  const paymentMode = typeof body.payment_mode === 'string' && PAYMENT_MODE_VALUES.has(body.payment_mode as never)
    ? (body.payment_mode as string) : null;
  const publicationInput = typeof body.publication === 'string' && AGREEMENT_PUBLICATION_VALUES.has(body.publication as never)
    ? (body.publication as string) : null;

  try {
    await ensureSchema();
    const sql = getSql();

    // Snapshot identity from the advertiser row if linked + no explicit override was sent.
    let snapshot = {
      company_name:        (body.company_name        as string | undefined) ?? null,
      rep_name:            (body.rep_name            as string | undefined) ?? null,
      advertiser_email:    (body.advertiser_email    as string | undefined) ?? null,
      advertiser_phone:    (body.advertiser_phone    as string | undefined) ?? null,
      advertiser_address:  (body.advertiser_address  as string | undefined) ?? null,
    };
    let publication: string | null = publicationInput;
    if (advertiserId && (!snapshot.company_name || publication == null)) {
      const adv = await sql`
        SELECT name, company, contact_email, phone, address, address_2, city, state, zip, publication
        FROM advertisers WHERE id = ${advertiserId}
      ` as unknown as Array<{
        name: string; company: string | null;
        contact_email: string | null; phone: string | null;
        address: string | null; address_2: string | null;
        city: string | null; state: string | null; zip: string | null;
        publication: string | null;
      }>;
      if (adv[0]) {
        const a = adv[0];
        snapshot = {
          company_name:       snapshot.company_name       ?? (a.company || a.name),
          rep_name:           snapshot.rep_name           ?? null,
          advertiser_email:   snapshot.advertiser_email   ?? a.contact_email,
          advertiser_phone:   snapshot.advertiser_phone   ?? a.phone,
          advertiser_address: snapshot.advertiser_address ?? ([a.address, a.address_2, a.city, a.state, a.zip].filter(Boolean).join(', ') || null),
        };
        if (publication == null && a.publication && AGREEMENT_PUBLICATION_VALUES.has(a.publication as never)) {
          publication = a.publication;
        }
      }
    }

    // Pressbook new fields
    const discountCents           = typeof body.discount_cents           === 'number' ? body.discount_cents           : null;
    const adPremiumCents          = typeof body.ad_premium_cents         === 'number' ? body.ad_premium_cents         : null;
    const totalMonthlyRateCents   = typeof body.total_monthly_rate_cents === 'number' ? body.total_monthly_rate_cents : null;
    const adTimingMonths          = body.ad_timing_months != null ? JSON.stringify(body.ad_timing_months) : null;
    const attachments             = body.attachments != null ? JSON.stringify(body.attachments) : JSON.stringify({ files: [] });
    const isRenewal               = typeof body.is_renewal    === 'boolean' ? body.is_renewal    : false;
    const renewedFromId           = typeof body.renewed_from_id === 'string' ? body.renewed_from_id : null;
    const termsAccepted           = typeof body.terms_accepted  === 'boolean' ? body.terms_accepted : null;
    const termsAcceptedAt         = typeof body.terms_accepted_at === 'string' ? body.terms_accepted_at : null;

    const rows = await sql`
      INSERT INTO agreements (
        advertiser_id, company_name, rep_name, advertiser_email,
        advertiser_phone, advertiser_address, type, status,
        start_date, end_date, ad_size, frequency, ad_rate_cents,
        amount_cents, payment_mode, notes, created_by,
        address, city, state, zip,
        discount_cents, ad_premium_cents, total_monthly_rate_cents,
        page_position, ad_timing_months,
        bill_to, billing_contact_name, billing_contact_phone,
        card_type, cardholder_name, card_number_last4, card_expiration, cardholder_address,
        signer_name, terms_accepted, terms_accepted_at,
        attachments, is_renewal, renewed_from_id,
        billing_email
      ) VALUES (
        ${advertiserId},
        ${snapshot.company_name},
        ${snapshot.rep_name},
        ${snapshot.advertiser_email},
        ${snapshot.advertiser_phone},
        ${snapshot.advertiser_address},
        ${type},
        ${status},
        ${(body.start_date    as string | null | undefined) ?? null},
        ${(body.end_date      as string | null | undefined) ?? null},
        ${(body.ad_size       as string | null | undefined) ?? null},
        ${(body.frequency     as string | null | undefined) ?? null},
        ${typeof body.ad_rate_cents === 'number' ? body.ad_rate_cents : null},
        ${typeof body.amount_cents  === 'number' ? body.amount_cents  : null},
        ${paymentMode},
        ${(body.notes         as string | null | undefined) ?? null},
        ${admin.email ?? null},
        ${(body.address       as string | null | undefined) ?? null},
        ${(body.city          as string | null | undefined) ?? null},
        ${(body.state         as string | null | undefined) ?? null},
        ${(body.zip           as string | null | undefined) ?? null},
        ${discountCents},
        ${adPremiumCents},
        ${totalMonthlyRateCents},
        ${(body.page_position as string | null | undefined) ?? null},
        ${adTimingMonths ? adTimingMonths : null}::jsonb,
        ${(body.bill_to                as string | null | undefined) ?? 'Partner'},
        ${(body.billing_contact_name   as string | null | undefined) ?? null},
        ${(body.billing_contact_phone  as string | null | undefined) ?? null},
        ${(body.card_type              as string | null | undefined) ?? null},
        ${(body.cardholder_name        as string | null | undefined) ?? null},
        ${(body.card_number_last4      as string | null | undefined) ?? null},
        ${(body.card_expiration        as string | null | undefined) ?? null},
        ${(body.cardholder_address     as string | null | undefined) ?? null},
        ${(body.signer_name            as string | null | undefined) ?? null},
        ${termsAccepted},
        ${termsAcceptedAt},
        ${attachments}::jsonb,
        ${isRenewal},
        ${renewedFromId},
        ${(body.billing_email          as string | null | undefined) ?? null}
      )
      RETURNING *
    `;
    const createdAg = rows[0] as unknown as Agreement;

    // Publication is on a separate UPDATE so the column is optional in the
    // INSERT — older deploys without the column won't crash on create.
    if (publication) {
      try {
        await sql`UPDATE agreements SET publication = ${publication} WHERE id = ${createdAg.id}`;
        (createdAg as { publication?: string | null }).publication = publication;
      } catch (e) {
        console.error('[admin/agreements POST] publication write failed', errMessage(e));
      }
    }

    // Channel is derived from `type` so /admin/ads/orders routes the row
    // into the correct Print / Digital / Email tab. Wrapped in try/catch
    // in case an older deploy doesn't yet have the channel column.
    {
      const derivedChannel = deriveChannelFromAgreementType(type);
      try {
        await sql`UPDATE agreements SET channel = ${derivedChannel} WHERE id = ${createdAg.id}`;
        (createdAg as { channel?: string }).channel = derivedChannel;
      } catch (e) {
        console.error('[admin/agreements POST] channel write failed', errMessage(e));
      }
    }

    // Mirror the agreement into the CRM as soon as it's created. New rows
    // land with status='prospect' so they stay off public-facing surfaces
    // until the agreement is signed; on signing the helper promotes them
    // to 'active'. Best-effort: never block agreement creation if the
    // mirror fails.
    let linkedAdvertiserId: number | null = createdAg.advertiser_id ?? null;
    try {
      const _advertiserLinkedFireCreatedAg = createdAg;
      const advRes = await ensureAdvertiserForAgreement(createdAg, {
        desiredStatus: status === 'signed' ? 'advertiser' : 'prospect',
      });
      if (advRes.outcome !== 'skipped') {
        linkedAdvertiserId = advRes.advertiserId;
      }
      if (advRes && ['created', 'matched', 'linked'].includes(String(advRes.outcome))) {
        captureServerEvent('advertiser_linked', admin?.email ?? 'server', {
          surface: 'admin_agreements',
          outcome: advRes.outcome,
          agreement_id: _advertiserLinkedFireCreatedAg.id,
          source: 'post',
        });
      }
    } catch (e) {
      console.error('[admin/agreements POST] ensureAdvertiserForAgreement failed', errMessage(e));
    }

    const finalAg =
      linkedAdvertiserId && linkedAdvertiserId !== createdAg.advertiser_id
        ? { ...createdAg, advertiser_id: linkedAdvertiserId }
        : createdAg;

    if (finalAg.advertiser_id) {
      try {
        await syncAgreementToAdvertiser(finalAg);
      } catch (e) {
        console.error('[admin/agreements POST] syncAgreementToAdvertiser failed', errMessage(e));
      }
    }

    return NextResponse.json({ agreement: finalAg }, { status: 201 });
  } catch (err) {
    console.error('[admin/agreements POST]', errMessage(err));
    captureServerEvent('agreement_create_failed', admin?.email ?? 'server', {
      surface: 'admin_agreements',
      detail: errMessage(err),
    });
    await flushServerEvents();
    return NextResponse.json({ error: 'create failed', detail: errMessage(err) }, { status: 500 });
  }
});
