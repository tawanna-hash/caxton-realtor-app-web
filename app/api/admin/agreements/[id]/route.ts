// app/api/admin/agreements/[id]/route.ts
//
// GET    — single agreement w/ advertiser name + invoice totals
// PATCH  — update any allow-listed field, plus appends an audit_log entry
// DELETE — hard delete (audit log preserved in any invoices is by FK SET NULL)

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import {
  AGREEMENT_PATCHABLE_FIELDS,
  AGREEMENT_STATUS_VALUES,
  AGREEMENT_TYPE_VALUES,
  AGREEMENT_PUBLICATION_VALUES,
  PAYMENT_MODE_VALUES,
  appendAudit,
  type AgreementWithAdvertiser,
  type AgreementAuditEntry,
  type Agreement,
} from '@/lib/agreements';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { autoCreateForAgreement } from '@/lib/renewal-reminders';
import { ensureAdvertiserForAgreement } from '@/lib/advertisers-from-agreement';
import { syncAgreementToAdvertiser } from '@/lib/server/billing-crm-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT ag.*, adv.name AS advertiser_name,
        COALESCE((SELECT SUM(i.total_cents)::int FROM invoices i WHERE i.agreement_id = ag.id AND i.status <> 'void'), 0) AS invoiced_cents,
        COALESCE((SELECT SUM(i.total_cents)::int FROM invoices i WHERE i.agreement_id = ag.id AND i.status = 'paid'), 0) AS paid_cents
      FROM agreements ag
      LEFT JOIN advertisers adv ON adv.id = ag.advertiser_id
      WHERE ag.id = ${id}
    `) as unknown as AgreementWithAdvertiser[];
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ agreement: rows[0] });
  } catch (err) {
    return NextResponse.json({ error: 'get failed', detail: errMessage(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();

    // Fetch existing for status-change detection + audit log merge
    const existingRows = await sql`SELECT * FROM agreements WHERE id = ${id}` as unknown as Array<{
      status: string; audit_log: AgreementAuditEntry[] | null;
    }>;
    if (existingRows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    const existing = existingRows[0];
    const prevStatus = existing.status;

    const updated: string[] = [];
    const apply = async (col: string, val: unknown, exec: () => Promise<unknown>) => {
      await exec(); updated.push(col); void val;
    };

    for (const field of AGREEMENT_PATCHABLE_FIELDS) {
      if (!(field in body)) continue;
      const raw = body[field as keyof typeof body];

      // Enum validation
      if (field === 'status' && typeof raw === 'string' && !AGREEMENT_STATUS_VALUES.has(raw as never)) continue;
      if (field === 'type'   && typeof raw === 'string' && !AGREEMENT_TYPE_VALUES.has(raw as never))   continue;
      if (field === 'payment_mode' && typeof raw === 'string' && !PAYMENT_MODE_VALUES.has(raw as never)) continue;
      if (field === 'publication' && raw !== null && typeof raw === 'string' && !AGREEMENT_PUBLICATION_VALUES.has(raw as never)) continue;

      switch (field) {
        case 'advertiser_id':
          if (raw === null || typeof raw === 'number') {
            await apply(field, raw, () => sql`UPDATE agreements SET advertiser_id = ${raw}            WHERE id = ${id}`);
          } break;
        case 'company_name':       await apply(field, raw, () => sql`UPDATE agreements SET company_name = ${raw}                       WHERE id = ${id}`); break;
        case 'rep_name':           await apply(field, raw, () => sql`UPDATE agreements SET rep_name = ${raw}                           WHERE id = ${id}`); break;
        case 'advertiser_email':   await apply(field, raw, () => sql`UPDATE agreements SET advertiser_email = ${raw}                   WHERE id = ${id}`); break;
        case 'advertiser_phone':   await apply(field, raw, () => sql`UPDATE agreements SET advertiser_phone = ${raw}                   WHERE id = ${id}`); break;
        case 'advertiser_address': await apply(field, raw, () => sql`UPDATE agreements SET advertiser_address = ${raw}                 WHERE id = ${id}`); break;
        case 'address':            await apply(field, raw, () => sql`UPDATE agreements SET address = ${raw}                            WHERE id = ${id}`); break;
        case 'city':               await apply(field, raw, () => sql`UPDATE agreements SET city = ${raw}                               WHERE id = ${id}`); break;
        case 'state':              await apply(field, raw, () => sql`UPDATE agreements SET state = ${raw}                              WHERE id = ${id}`); break;
        case 'zip':                await apply(field, raw, () => sql`UPDATE agreements SET zip = ${raw}                                WHERE id = ${id}`); break;
        case 'type':               await apply(field, raw, () => sql`UPDATE agreements SET type = ${raw}                               WHERE id = ${id}`); break;
        case 'status':             await apply(field, raw, () => sql`UPDATE agreements SET status = ${raw}                             WHERE id = ${id}`); break;
        case 'start_date':         await apply(field, raw, () => sql`UPDATE agreements SET start_date = ${raw}                         WHERE id = ${id}`); break;
        case 'end_date':           await apply(field, raw, () => sql`UPDATE agreements SET end_date = ${raw}                           WHERE id = ${id}`); break;
        case 'ad_size':            await apply(field, raw, () => sql`UPDATE agreements SET ad_size = ${raw}                            WHERE id = ${id}`); break;
        case 'frequency':          await apply(field, raw, () => sql`UPDATE agreements SET frequency = ${raw}                          WHERE id = ${id}`); break;
        case 'ad_rate_cents':      await apply(field, raw, () => sql`UPDATE agreements SET ad_rate_cents = ${raw}                      WHERE id = ${id}`); break;
        case 'ad_timing':          await apply(field, raw, () => sql`UPDATE agreements SET ad_timing = ${JSON.stringify(raw ?? null)}::jsonb WHERE id = ${id}`); break;
        case 'eblast_packages':    await apply(field, raw, () => sql`UPDATE agreements SET eblast_packages = ${JSON.stringify(Array.isArray(raw) ? raw : [])}::jsonb WHERE id = ${id}`); break;
        case 'discount_cents':     await apply(field, raw, () => sql`UPDATE agreements SET discount_cents = ${raw}                     WHERE id = ${id}`); break;
        case 'ad_premium_cents':   await apply(field, raw, () => sql`UPDATE agreements SET ad_premium_cents = ${raw}                   WHERE id = ${id}`); break;
        case 'total_monthly_rate_cents': await apply(field, raw, () => sql`UPDATE agreements SET total_monthly_rate_cents = ${raw}     WHERE id = ${id}`); break;
        case 'page_position':      await apply(field, raw, () => sql`UPDATE agreements SET page_position = ${raw}                      WHERE id = ${id}`); break;
        case 'ad_timing_months':   await apply(field, raw, () => sql`UPDATE agreements SET ad_timing_months = ${raw != null ? JSON.stringify(raw) : null}::jsonb WHERE id = ${id}`); break;
        case 'amount_cents':       await apply(field, raw, () => sql`UPDATE agreements SET amount_cents = ${raw}                       WHERE id = ${id}`); break;
        case 'sign_date':          await apply(field, raw, () => sql`UPDATE agreements SET sign_date = ${raw}                          WHERE id = ${id}`); break;
        case 'exp_date':           await apply(field, raw, () => sql`UPDATE agreements SET exp_date = ${raw}                           WHERE id = ${id}`); break;
        case 'renewal_notice_date':await apply(field, raw, () => sql`UPDATE agreements SET renewal_notice_date = ${raw}                WHERE id = ${id}`); break;
        case 'signed_at':          await apply(field, raw, () => sql`UPDATE agreements SET signed_at = ${raw}                          WHERE id = ${id}`); break;
        case 'signed_document':    await apply(field, raw, () => sql`UPDATE agreements SET signed_document = ${raw}                    WHERE id = ${id}`); break;
        case 'sent_to_email':      await apply(field, raw, () => sql`UPDATE agreements SET sent_to_email = ${raw}                      WHERE id = ${id}`); break;
        case 'is_uploaded':        await apply(field, raw, () => sql`UPDATE agreements SET is_uploaded = ${!!raw}                      WHERE id = ${id}`); break;
        case 'signer_name':        await apply(field, raw, () => sql`UPDATE agreements SET signer_name = ${raw}                        WHERE id = ${id}`); break;
        case 'terms_accepted':     await apply(field, raw, () => sql`UPDATE agreements SET terms_accepted = ${raw}                     WHERE id = ${id}`); break;
        case 'terms_accepted_at':  await apply(field, raw, () => sql`UPDATE agreements SET terms_accepted_at = ${raw}                  WHERE id = ${id}`); break;
        case 'billing_name':       await apply(field, raw, () => sql`UPDATE agreements SET billing_name = ${raw}                       WHERE id = ${id}`); break;
        case 'billing_email':      await apply(field, raw, () => sql`UPDATE agreements SET billing_email = ${raw}                      WHERE id = ${id}`); break;
        case 'payment_mode':       await apply(field, raw, () => sql`UPDATE agreements SET payment_mode = ${raw}                       WHERE id = ${id}`); break;
        case 'bill_to':            await apply(field, raw, () => sql`UPDATE agreements SET bill_to = ${raw}                            WHERE id = ${id}`); break;
        case 'billing_contact_name':  await apply(field, raw, () => sql`UPDATE agreements SET billing_contact_name = ${raw}            WHERE id = ${id}`); break;
        case 'billing_contact_phone': await apply(field, raw, () => sql`UPDATE agreements SET billing_contact_phone = ${raw}           WHERE id = ${id}`); break;
        case 'card_type':          await apply(field, raw, () => sql`UPDATE agreements SET card_type = ${raw}                          WHERE id = ${id}`); break;
        case 'cardholder_name':    await apply(field, raw, () => sql`UPDATE agreements SET cardholder_name = ${raw}                    WHERE id = ${id}`); break;
        case 'card_number_last4':  await apply(field, raw, () => sql`UPDATE agreements SET card_number_last4 = ${raw}                  WHERE id = ${id}`); break;
        case 'card_expiration':    await apply(field, raw, () => sql`UPDATE agreements SET card_expiration = ${raw}                    WHERE id = ${id}`); break;
        case 'cardholder_address': await apply(field, raw, () => sql`UPDATE agreements SET cardholder_address = ${raw}                 WHERE id = ${id}`); break;
        case 'stripe_customer_id': await apply(field, raw, () => sql`UPDATE agreements SET stripe_customer_id = ${raw}                 WHERE id = ${id}`); break;
        case 'stripe_invoice_id':  await apply(field, raw, () => sql`UPDATE agreements SET stripe_invoice_id = ${raw}                  WHERE id = ${id}`); break;
        case 'stripe_payment_intent_id': await apply(field, raw, () => sql`UPDATE agreements SET stripe_payment_intent_id = ${raw}     WHERE id = ${id}`); break;
        case 'stripe_payment_link_url':  await apply(field, raw, () => sql`UPDATE agreements SET stripe_payment_link_url = ${raw}      WHERE id = ${id}`); break;
        case 'paid_at':            await apply(field, raw, () => sql`UPDATE agreements SET paid_at = ${raw}                            WHERE id = ${id}`); break;
        case 'attachments':        await apply(field, raw, () => sql`UPDATE agreements SET attachments = ${raw != null ? JSON.stringify(raw) : null}::jsonb WHERE id = ${id}`); break;
        case 'is_renewal':         await apply(field, raw, () => sql`UPDATE agreements SET is_renewal = ${!!raw}                       WHERE id = ${id}`); break;
        case 'renewed_from_id':
          if (raw === null || typeof raw === 'string') {
            await apply(field, raw, () => sql`UPDATE agreements SET renewed_from_id = ${raw}         WHERE id = ${id}`);
          } break;
        case 'notes':              await apply(field, raw, () => sql`UPDATE agreements SET notes = ${raw}                              WHERE id = ${id}`); break;
        case 'publication':
          if (raw === null || typeof raw === 'string') {
            await apply(field, raw, () => sql`UPDATE agreements SET publication = ${raw}                  WHERE id = ${id}`);
          } break;
      }
    }

    if (updated.length === 0) {
      return NextResponse.json({ error: 'no patchable fields provided' }, { status: 400 });
    }

    // Append audit entry on every save
    const newLog = appendAudit(existing.audit_log, {
      event: updated.includes('status') ? `status → ${body.status}` : 'updated',
      timestamp: new Date().toISOString(),
      user_email: admin.email,
      details: updated.join(','),
    });
    await sql`UPDATE agreements SET audit_log = ${JSON.stringify(newLog)}::jsonb, updated_at = NOW() WHERE id = ${id}`;

    const rows = await sql`SELECT * FROM agreements WHERE id = ${id}`;
    const savedAg = rows[0] as unknown as Agreement;

    // Side effects on status transitions into 'signed'
    const newStatus = body.status as string | undefined;
    const isSignedTransition = newStatus === 'signed' && prevStatus !== 'signed';

    // Keep the CRM contact in sync on every PATCH: a contact-field edit on
    // a still-unlinked agreement should mirror into the CRM, and any save
    // that signs the agreement should promote prospect -> active.
    const CONTACT_FIELDS = new Set([
      'company_name', 'rep_name', 'advertiser_email',
      'advertiser_phone', 'advertiser_address',
      'billing_email', 'billing_contact_name', 'billing_contact_phone',
      'signer_name',
    ]);
    const touchedContact = updated.some((f) => CONTACT_FIELDS.has(f));
    const needsMirror =
      isSignedTransition ||
      (touchedContact && (savedAg.advertiser_id == null));

    if (needsMirror) {
      try {
        const advRes = await ensureAdvertiserForAgreement(savedAg, {
          desiredStatus: isSignedTransition ? 'active' : 'prospect',
        });
        if (advRes.outcome !== 'skipped') {
          const advLog = appendAudit(savedAg.audit_log, {
            event: 'advertiser_linked',
            timestamp: new Date().toISOString(),
            user_email: admin.email,
            details: `Advertiser #${advRes.advertiserId} ${advRes.outcome}`,
          });
          await sql`UPDATE agreements SET audit_log = ${JSON.stringify(advLog)}::jsonb WHERE id = ${id}`;
          // Re-fetch so savedAg reflects the freshly linked advertiser_id
          const refreshed = await sql`SELECT * FROM agreements WHERE id = ${id}`;
          if (refreshed.length > 0) {
            Object.assign(savedAg, refreshed[0] as unknown as Agreement);
          }
        }
      } catch (e) {
        console.error('[admin/agreements PATCH] ensureAdvertiserForAgreement failed', errMessage(e));
      }
    }

    // Mirror agreement -> advertiser sync columns (best effort).
    if (savedAg.advertiser_id) {
      try {
        await syncAgreementToAdvertiser(savedAg);
      } catch (e) {
        console.error('[admin/agreements PATCH] syncAgreementToAdvertiser failed', errMessage(e));
      }
    }

    if (isSignedTransition) {
      // Auto-create renewal reminder.
      if (savedAg.exp_date) {
        await autoCreateForAgreement(savedAg).catch((e: unknown) => {
          console.error('[admin/agreements PATCH] autoCreateForAgreement failed', errMessage(e));
        });
      }
    }

    return NextResponse.json({ agreement: savedAg, updated_fields: updated });
  } catch (err) {
    console.error('[admin/agreements PATCH]', errMessage(err));
    return NextResponse.json({ error: 'patch failed', detail: errMessage(err) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  try {
    await ensureSchema();
    const sql = getSql();
    await sql`DELETE FROM agreements WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: 'delete failed', detail: errMessage(err) }, { status: 500 });
  }
}
