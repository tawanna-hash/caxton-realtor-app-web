// app/api/admin/agreements/route.ts
//
// GET  — list all agreements, with advertiser name + invoice totals
// POST — create a new agreement (draft by default)

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import {
  AGREEMENT_STATUS_VALUES,
  AGREEMENT_TYPE_VALUES,
  PAYMENT_MODE_VALUES,
  type AgreementWithAdvertiser,
} from '@/lib/agreements';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

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
    const rows = (await sql`
      SELECT
        ag.*,
        adv.name AS advertiser_name,
        COALESCE((
          SELECT SUM(i.total_cents)::int FROM invoices i
           WHERE i.agreement_id = ag.id AND i.status <> 'void'
        ), 0) AS invoiced_cents,
        COALESCE((
          SELECT SUM(i.total_cents)::int FROM invoices i
           WHERE i.agreement_id = ag.id AND i.status = 'paid'
        ), 0) AS paid_cents
      FROM agreements ag
      LEFT JOIN advertisers adv ON adv.id = ag.advertiser_id
      ORDER BY ag.updated_at DESC
    `) as unknown as AgreementWithAdvertiser[];
    return NextResponse.json({ agreements: rows });
  } catch (err) {
    console.error('[admin/agreements GET]', errMessage(err));
    return NextResponse.json({ error: 'list failed', detail: errMessage(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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

  try {
    await ensureSchema();
    const sql = getSql();

    // Snapshot identity from the advertiser row if linked + no
    // explicit override was sent.
    let snapshot = {
      company_name:        (body.company_name        as string | undefined) ?? null,
      rep_name:            (body.rep_name            as string | undefined) ?? null,
      advertiser_email:    (body.advertiser_email    as string | undefined) ?? null,
      advertiser_phone:    (body.advertiser_phone    as string | undefined) ?? null,
      advertiser_address:  (body.advertiser_address  as string | undefined) ?? null,
    };
    if (advertiserId && !snapshot.company_name) {
      const adv = await sql`
        SELECT name, company, contact_email, phone, address, address_2, city, state, zip
        FROM advertisers WHERE id = ${advertiserId}
      ` as unknown as Array<{
        name: string; company: string | null;
        contact_email: string | null; phone: string | null;
        address: string | null; address_2: string | null;
        city: string | null; state: string | null; zip: string | null;
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
      }
    }

    const rows = await sql`
      INSERT INTO agreements (
        advertiser_id, company_name, rep_name, advertiser_email,
        advertiser_phone, advertiser_address, type, status,
        start_date, end_date, ad_size, frequency, ad_rate_cents,
        amount_cents, payment_mode, notes, created_by
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
        ${admin.email ?? null}
      )
      RETURNING *
    `;
    return NextResponse.json({ agreement: rows[0] }, { status: 201 });
  } catch (err) {
    console.error('[admin/agreements POST]', errMessage(err));
    return NextResponse.json({ error: 'create failed', detail: errMessage(err) }, { status: 500 });
  }
}
