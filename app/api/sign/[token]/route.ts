// app/api/sign/[token]/route.ts
//
// Public (no admin auth) sign API — the HMAC token IS the auth.
//
// POST — Apply digital signature to agreement (with optional patches).
// PATCH — Update advertiser/billing/order fields (allowlisted).

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { verifyToken } from '@/lib/sign-token';
import { appendAudit, type Agreement } from '@/lib/agreements';
import { autoCreateForAgreement } from '@/lib/renewal-reminders';
import { ensureAdvertiserForAgreement } from '@/lib/advertisers-from-agreement';
import {
  syncAgreementToAdvertiser,
  syncAgreementToLocationsAndStaff,
} from '@/lib/server/billing-crm-sync';
import { notifyAgreementSigned } from '@/lib/server/agreement-signed-notify';
import { rateLimit } from '@/lib/server/rate-limit';
import { ApiError } from '@/lib/server/error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ token: string }> };

// Fields the advertiser is allowed to update via PATCH — strings / null
const SIGN_PATCHABLE_STR = new Set([
  'company_name', 'rep_name', 'advertiser_email', 'advertiser_phone',
  'address', 'city', 'state', 'zip',
  'ad_size', 'frequency', 'page_position',
  'bill_to', 'billing_email', 'billing_contact_name', 'billing_contact_phone',
  'payment_mode', 'card_type', 'cardholder_name', 'card_number_last4',
  'card_expiration', 'cardholder_address',
]);

// Integer cents fields
const SIGN_PATCHABLE_INT = new Set([
  'ad_rate_cents', 'discount_cents', 'ad_premium_cents', 'total_monthly_rate_cents',
]);

// Date fields (YYYY-MM-DD)
const SIGN_PATCHABLE_DATE = new Set(['exp_date']);

// JSON object fields
const SIGN_PATCHABLE_JSON = new Set(['ad_timing_months']);

const MAX_CENTS = 100_000_000;

async function applyPatches(
  sql: ReturnType<typeof getSql>,
  id: string,
  body: Record<string, unknown>,
): Promise<void> {
  for (const field of Object.keys(body)) {
    const val = body[field];

    if (SIGN_PATCHABLE_STR.has(field)) {
      if (typeof val !== 'string' && val !== null) continue;
      const v = val as string | null;
      switch (field) {
        case 'company_name':          await sql`UPDATE agreements SET company_name          = ${v} WHERE id = ${id}`; break;
        case 'rep_name':              await sql`UPDATE agreements SET rep_name              = ${v} WHERE id = ${id}`; break;
        case 'advertiser_email':      await sql`UPDATE agreements SET advertiser_email      = ${v} WHERE id = ${id}`; break;
        case 'advertiser_phone':      await sql`UPDATE agreements SET advertiser_phone      = ${v} WHERE id = ${id}`; break;
        case 'address':               await sql`UPDATE agreements SET address               = ${v} WHERE id = ${id}`; break;
        case 'city':                  await sql`UPDATE agreements SET city                  = ${v} WHERE id = ${id}`; break;
        case 'state':                 await sql`UPDATE agreements SET state                 = ${v} WHERE id = ${id}`; break;
        case 'zip':                   await sql`UPDATE agreements SET zip                   = ${v} WHERE id = ${id}`; break;
        case 'ad_size':               await sql`UPDATE agreements SET ad_size               = ${v} WHERE id = ${id}`; break;
        case 'frequency':             await sql`UPDATE agreements SET frequency             = ${v} WHERE id = ${id}`; break;
        case 'page_position':         await sql`UPDATE agreements SET page_position         = ${v} WHERE id = ${id}`; break;
        case 'bill_to':               await sql`UPDATE agreements SET bill_to               = ${v} WHERE id = ${id}`; break;
        case 'billing_email':         await sql`UPDATE agreements SET billing_email         = ${v} WHERE id = ${id}`; break;
        case 'billing_contact_name':  await sql`UPDATE agreements SET billing_contact_name  = ${v} WHERE id = ${id}`; break;
        case 'billing_contact_phone': await sql`UPDATE agreements SET billing_contact_phone = ${v} WHERE id = ${id}`; break;
        case 'payment_mode':          await sql`UPDATE agreements SET payment_mode          = ${v} WHERE id = ${id}`; break;
        case 'card_type':             await sql`UPDATE agreements SET card_type             = ${v} WHERE id = ${id}`; break;
        case 'cardholder_name':       await sql`UPDATE agreements SET cardholder_name       = ${v} WHERE id = ${id}`; break;
        case 'card_number_last4':     await sql`UPDATE agreements SET card_number_last4     = ${v} WHERE id = ${id}`; break;
        case 'card_expiration':       await sql`UPDATE agreements SET card_expiration       = ${v} WHERE id = ${id}`; break;
        case 'cardholder_address':    await sql`UPDATE agreements SET cardholder_address    = ${v} WHERE id = ${id}`; break;
      }

    } else if (SIGN_PATCHABLE_INT.has(field)) {
      if (val === null) {
        switch (field) {
          case 'ad_rate_cents':            await sql`UPDATE agreements SET ad_rate_cents            = NULL WHERE id = ${id}`; break;
          case 'discount_cents':           await sql`UPDATE agreements SET discount_cents           = NULL WHERE id = ${id}`; break;
          case 'ad_premium_cents':         await sql`UPDATE agreements SET ad_premium_cents         = NULL WHERE id = ${id}`; break;
          case 'total_monthly_rate_cents': await sql`UPDATE agreements SET total_monthly_rate_cents = NULL WHERE id = ${id}`; break;
        }
        continue;
      }
      if (typeof val !== 'number' || !Number.isInteger(val) || val < 0 || val > MAX_CENTS) continue;
      const n = val;
      switch (field) {
        case 'ad_rate_cents':            await sql`UPDATE agreements SET ad_rate_cents            = ${n} WHERE id = ${id}`; break;
        case 'discount_cents':           await sql`UPDATE agreements SET discount_cents           = ${n} WHERE id = ${id}`; break;
        case 'ad_premium_cents':         await sql`UPDATE agreements SET ad_premium_cents         = ${n} WHERE id = ${id}`; break;
        case 'total_monthly_rate_cents': await sql`UPDATE agreements SET total_monthly_rate_cents = ${n} WHERE id = ${id}`; break;
      }

    } else if (SIGN_PATCHABLE_DATE.has(field)) {
      if (val === null) {
        await sql`UPDATE agreements SET exp_date = NULL WHERE id = ${id}`;
        continue;
      }
      if (typeof val !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(val)) continue;
      const d = val;
      await sql`UPDATE agreements SET exp_date = ${d} WHERE id = ${id}`;

    } else if (SIGN_PATCHABLE_JSON.has(field)) {
      if (val === null) {
        await sql`UPDATE agreements SET ad_timing_months = NULL WHERE id = ${id}`;
        continue;
      }
      if (typeof val !== 'object' || Array.isArray(val)) continue;
      const j = JSON.stringify(val);
      await sql`UPDATE agreements SET ad_timing_months = ${j}::jsonb WHERE id = ${id}`;
    }
  }
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { token } = await ctx.params;
  const parsed = verifyToken(token);
  if (!parsed) return NextResponse.json({ error: 'invalid or expired token' }, { status: 401 });
  const { agreementId: id } = parsed;

  // F-06: rate-limit signing mutations even though the HMAC token IS the auth.
  // Keyed by agreementId so each token gets its own bucket (an attacker who
  // leaked a token still hits a per-agreement ceiling).
  try {
    await rateLimit('signWizard', id);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 429) {
      return NextResponse.json({ error: 'too many requests' }, { status: 429 });
    }
    throw err;
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const signerName = typeof body.signerName === 'string' ? body.signerName.trim() : '';
  const signedAt = typeof body.signedAt === 'string' ? body.signedAt : new Date().toISOString().slice(0, 10);
  const termsAccepted = body.termsAccepted === true;
  const patches = body.patches && typeof body.patches === 'object' && !Array.isArray(body.patches)
    ? body.patches as Record<string, unknown>
    : null;

  // Sign method + signature/document URL (new — type / draw / upload).
  // Method is informational and stored only in the audit log; signed_document
  // / is_uploaded carry the actual persisted state.
  const signMethodRaw = typeof body.signMethod === 'string' ? body.signMethod : 'type';
  const signMethod: 'type' | 'draw' | 'upload' =
    signMethodRaw === 'draw' || signMethodRaw === 'upload' ? signMethodRaw : 'type';
  const signedDocumentUrl = typeof body.signedDocumentUrl === 'string' && body.signedDocumentUrl.trim()
    ? body.signedDocumentUrl.trim()
    : null;

  if (!signerName) return NextResponse.json({ error: 'signerName is required' }, { status: 400 });
  if (!termsAccepted) return NextResponse.json({ error: 'termsAccepted must be true' }, { status: 400 });
  if ((signMethod === 'draw' || signMethod === 'upload') && !signedDocumentUrl) {
    return NextResponse.json(
      { error: `signedDocumentUrl is required for sign method '${signMethod}'` },
      { status: 400 },
    );
  }

  try {
    await ensureSchema();
    const sql = getSql();

    const rows = await sql`SELECT * FROM agreements WHERE id = ${id}` as unknown as Agreement[];
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const ag = rows[0];

    // F-edge: replay guard. Once an agreement is signed, the sign wizard
    // should not re-sign it. The admin's amend/re-sign flow goes through
    // a separate admin endpoint.
    if (ag.signed_at) {
      return NextResponse.json(
        { error: 'agreement already signed', signed_at: ag.signed_at },
        { status: 409 },
      );
    }

    // Apply any last-second patches first
    if (patches) {
      await applyPatches(sql, id, patches);
    }

    const signedAtTs = signedAt.length === 10 ? `${signedAt}T00:00:00.000Z` : signedAt;
    const now = new Date().toISOString();

    // When a drawn signature image or uploaded signed doc is provided,
    // persist it on `signed_document`. `is_uploaded` is set true only for
    // 'upload' (a pre-signed document supplied by the advertiser); drawn
    // signatures keep is_uploaded=false since the wizard still produced the
    // signature.
    if (signedDocumentUrl) {
      const isUploaded = signMethod === 'upload';
      await sql`
        UPDATE agreements
        SET signed_document = ${signedDocumentUrl},
            is_uploaded = ${isUploaded}
        WHERE id = ${id}
      `;
    }

    await sql`
      UPDATE agreements
      SET status = 'signed',
          signer_name = ${signerName},
          signed_at = ${signedAtTs},
          terms_accepted = true,
          terms_accepted_at = ${now},
          updated_at = NOW()
      WHERE id = ${id}
    `;

    // Append audit
    const methodLabel = signMethod === 'draw' ? 'drawn signature' : signMethod === 'upload' ? 'uploaded signed document' : 'typed signature';
    const newLog = appendAudit(ag.audit_log, {
      event: 'signed',
      timestamp: now,
      details: `Digitally signed by "${signerName}" via sign wizard (${methodLabel})`,
    });
    await sql`UPDATE agreements SET audit_log = ${JSON.stringify(newLog)}::jsonb WHERE id = ${id}`;

    // Fetch updated agreement for downstream side effects
    const updatedRows = await sql`SELECT * FROM agreements WHERE id = ${id}` as unknown as Agreement[];

    // Auto-create or link the advertiser in /admin/advertisers (idempotent).
    let advertiserOutcome: string | null = null;
    if (updatedRows.length > 0) {
      try {
        // Sign wizard always finalizes the agreement => contact is advertiser.
        const result = await ensureAdvertiserForAgreement(updatedRows[0], {
          desiredStatus: 'advertiser',
        });
        advertiserOutcome = result.outcome;
        if (result.outcome !== 'skipped') {
          // Audit the advertiser link/create.
          const advLog = appendAudit(updatedRows[0].audit_log, {
            event: 'advertiser_linked',
            timestamp: new Date().toISOString(),
            details: `Advertiser #${result.advertiserId} ${result.outcome} via sign wizard`,
          });
          await sql`UPDATE agreements SET audit_log = ${JSON.stringify(advLog)}::jsonb WHERE id = ${id}`;
        }
      } catch (e) {
        console.error('[api/sign POST] ensureAdvertiserForAgreement failed', e instanceof Error ? e.message : String(e));
      }

      // Re-load after ensureAdvertiserForAgreement, which may have set
      // advertiser_id on the agreement. syncAgreementToAdvertiser is a
      // no-op unless advertiser_id is non-null.
      const refreshed = await sql`SELECT * FROM agreements WHERE id = ${id}` as unknown as Agreement[];
      const finalAg = refreshed[0] ?? updatedRows[0];

      // Step 2 (2026-06-15): Mirror company + rep details onto the Billing
      // cache columns on the advertiser row so the Billing page reflects
      // everything captured at sign. Fill-blank only on identity fields;
      // billing/payment/deal fields overwrite (agreement is source of truth).
      try {
        const cols = await syncAgreementToAdvertiser(finalAg);
        if (cols.length > 0) {
          const syncLog = appendAudit(finalAg.audit_log, {
            event: 'crm_synced',
            timestamp: new Date().toISOString(),
            details: `Sign wizard mirrored ${cols.length} field(s) to CRM: ${cols.join(', ')}`,
          });
          await sql`UPDATE agreements SET audit_log = ${JSON.stringify(syncLog)}::jsonb WHERE id = ${id}`;
        }
      } catch (e) {
        console.error('[api/sign POST] syncAgreementToAdvertiser failed', e instanceof Error ? e.message : String(e));
      }

      // Step 3 (2026-06-15): Seed Locations & Staff from the signed
      // agreement. Idempotent — skips if a location/staff row already
      // exists for this advertiser (matched by name or email).
      try {
        const created = await syncAgreementToLocationsAndStaff(finalAg);
        if (created.length > 0) {
          const locLog = appendAudit(finalAg.audit_log, {
            event: 'locations_staff_seeded',
            timestamp: new Date().toISOString(),
            details: `Sign wizard seeded ${created.join(' + ')} from agreement`,
          });
          await sql`UPDATE agreements SET audit_log = ${JSON.stringify(locLog)}::jsonb WHERE id = ${id}`;
        }
      } catch (e) {
        console.error('[api/sign POST] syncAgreementToLocationsAndStaff failed', e instanceof Error ? e.message : String(e));
      }
    }

    // Auto-create renewal reminder 30 days before expiration.
    if (updatedRows.length > 0 && updatedRows[0].exp_date) {
      await autoCreateForAgreement(updatedRows[0]).catch((e: unknown) => {
        console.error('[api/sign POST] autoCreateForAgreement failed', e instanceof Error ? e.message : String(e));
      });
    }

    // Email admin notification that an agreement was just signed.
    // Never throws — caller doesn't need to know about email outages.
    if (updatedRows.length > 0) {
      try {
        await notifyAgreementSigned(updatedRows[0]);
      } catch (e) {
        console.error('[api/sign POST] notifyAgreementSigned failed', e instanceof Error ? e.message : String(e));
      }
    }

    return NextResponse.json({ ok: true, advertiserOutcome });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'sign failed', detail: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const { token } = await ctx.params;
  const parsed = verifyToken(token);
  if (!parsed) return NextResponse.json({ error: 'invalid or expired token' }, { status: 401 });
  const { agreementId: id } = parsed;

  // F-06: rate-limit sign-wizard mutations.
  try {
    await rateLimit('signWizard', id);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 429) {
      return NextResponse.json({ error: 'too many requests' }, { status: 429 });
    }
    throw err;
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();

    const rows = await sql`SELECT id, signed_at FROM agreements WHERE id = ${id}` as unknown as { id: string; signed_at: string | null }[];
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });

    // F-edge: don't allow field patches on an already-signed agreement.
    if (rows[0].signed_at) {
      return NextResponse.json(
        { error: 'agreement already signed', signed_at: rows[0].signed_at },
        { status: 409 },
      );
    }

    await applyPatches(sql, id, body);
    await sql`UPDATE agreements SET updated_at = NOW() WHERE id = ${id}`;

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'patch failed', detail: msg }, { status: 500 });
  }
}
