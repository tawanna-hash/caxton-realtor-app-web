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
import { captureServerEvent, flushServerEvents } from '@/lib/server/posthog';
import { applyPatches } from '@/lib/server/agreement-patches';
import { allowsCheckPayment, deriveChannelFromAgreementType, isAdChannel } from '@/lib/ad-channels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ token: string }> };

// -----------------------------------------------------------------------------
// Sign-time anchor recompute (Part B).
// Rule: signed day-of-month ≤ 15 → first issue = signed month; else next month.
// For print lines, recompute start_date / end_date / expiration_date /
// renewal_reminder_date / ad_timing_months / ad_timing_years.
// -----------------------------------------------------------------------------
const MONTH_KEYS = ['january','february','march','april','may','june','july','august','september','october','november','december'] as const;

function freqToMonths(frequency: string | null | undefined): number {
  if (!frequency) return 1;
  const m = /^(\d+)/.exec(String(frequency).trim());
  if (!m) return 1;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function pad2(n: number): string { return n < 10 ? `0${n}` : `${n}`; }

function firstIssueMonth(signedIsoUtc: string): { year: number; monthIdx: number } {
  // signedIsoUtc is UTC — but the deadline is in publisher-local time.
  // Use the ISO date component directly; deadlines are calendar-day granular.
  const d = signedIsoUtc.slice(0, 10);
  const [y, m, day] = d.split('-').map(Number);
  if (!y || !m || !day) {
    const now = new Date();
    return { year: now.getUTCFullYear(), monthIdx: now.getUTCMonth() };
  }
  // day-of-month rule: ≤15 same month, else next month.
  if (day <= 15) return { year: y, monthIdx: m - 1 };
  const next = new Date(Date.UTC(y, m - 1 + 1, 1));
  return { year: next.getUTCFullYear(), monthIdx: next.getUTCMonth() };
}

function computePrintRun(signedIsoUtc: string, months: number):
  { startIso: string; endIso: string; expIso: string; remindIso: string; timingMonths: Record<string, boolean>; timingYears: Record<string, string> } {
  const { year, monthIdx } = firstIssueMonth(signedIsoUtc);
  const startDate = new Date(Date.UTC(year, monthIdx, 1));
  // end = last day of (monthIdx + months - 1)
  const endMonthExclusive = monthIdx + months;
  const endDate = new Date(Date.UTC(year, endMonthExclusive, 0)); // day 0 = last day of prior month
  const remindDate = new Date(endDate.getTime());
  remindDate.setUTCDate(remindDate.getUTCDate() - 30);
  const iso = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

  const timingMonths: Record<string, boolean> = {};
  const timingYears: Record<string, string> = {};
  for (let i = 0; i < months; i++) {
    const cur = new Date(Date.UTC(year, monthIdx + i, 1));
    const key = MONTH_KEYS[cur.getUTCMonth()];
    timingMonths[key] = true;
    timingYears[key] = String(cur.getUTCFullYear());
  }

  return {
    startIso: iso(startDate),
    endIso: iso(endDate),
    expIso: iso(endDate),
    remindIso: iso(remindDate),
    timingMonths,
    timingYears,
  };
}

// Recompute + persist run dates for all PRINT line items on this agreement.
// Returns count of updated rows.
async function recomputePrintAnchors(
  sql: ReturnType<typeof getSql>,
  agreementId: string,
  signedIsoUtc: string,
): Promise<number> {
  type Row = { id: string; frequency: string | null };
  const rows = await sql`
    SELECT id, frequency
    FROM agreement_line_items
    WHERE agreement_id = ${agreementId} AND channel = 'print'
  ` as unknown as Row[];
  let updated = 0;
  for (const r of rows) {
    const months = freqToMonths(r.frequency);
    const run = computePrintRun(signedIsoUtc, months);
    await sql`
      UPDATE agreement_line_items
      SET start_date            = ${run.startIso}::date,
          end_date              = ${run.endIso}::date,
          expiration_date       = ${run.expIso}::date,
          renewal_reminder_date = ${run.remindIso}::date,
          ad_timing_months      = ${JSON.stringify(run.timingMonths)}::jsonb,
          ad_timing_years       = ${JSON.stringify(run.timingYears)}::jsonb
      WHERE id = ${r.id}
    `;
    updated++;
  }
  return updated;
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

    const storedChannel = (ag as Agreement & { channel?: string | null }).channel;
    const channel = isAdChannel(storedChannel)
      ? storedChannel
      : deriveChannelFromAgreementType(ag.type);
    if (patches?.payment_mode === 'check' && !allowsCheckPayment(channel)) {
      return NextResponse.json(
        { error: 'check payment is only available for print agreements' },
        { status: 400 },
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

    // Sign-time anchor recompute — 15th-cutoff rule for print lines.
    let printAnchorUpdated = 0;
    try {
      printAnchorUpdated = await recomputePrintAnchors(sql, id, signedAtTs);
    } catch (err) {
      console.error('[api/sign POST] recomputePrintAnchors failed', err instanceof Error ? err.message : String(err));
    }

    // Append audit
    const methodLabel = signMethod === 'draw' ? 'drawn signature' : signMethod === 'upload' ? 'uploaded signed document' : 'typed signature';
    const anchorNote = printAnchorUpdated > 0 ? ` · re-anchored ${printAnchorUpdated} print line${printAnchorUpdated === 1 ? '' : 's'}` : '';
    const newLog = appendAudit(ag.audit_log, {
      event: 'signed',
      timestamp: now,
      details: `Digitally signed by "${signerName}" via sign wizard (${methodLabel})${anchorNote}`,
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
        if (['created', 'matched', 'linked'].includes(String(result.outcome))) {
          captureServerEvent('advertiser_linked', updatedRows[0].id, {
            surface: 'sign',
            outcome: result.outcome,
            agreement_id: updatedRows[0].id,
          });
        }
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
          captureServerEvent('locations_staff_seeded', finalAg.id, {
            surface: 'sign',
            agreement_id: finalAg.id,
            created_count: created.length,
          });
        }
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

    captureServerEvent('advertiser_signed', updatedRows[0].id, {
      surface: 'sign',
      agreement_id: updatedRows[0].id,
      advertiser_outcome: advertiserOutcome,
    });
    await flushServerEvents();
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

    const rows = await sql`
      SELECT id, signed_at, type, channel FROM agreements WHERE id = ${id}
    ` as unknown as {
      id: string;
      signed_at: string | null;
      type: string | null;
      channel: string | null;
    }[];
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });

    // F-edge: don't allow field patches on an already-signed agreement.
    if (rows[0].signed_at) {
      return NextResponse.json(
        { error: 'agreement already signed', signed_at: rows[0].signed_at },
        { status: 409 },
      );
    }

    const channel = isAdChannel(rows[0].channel)
      ? rows[0].channel
      : deriveChannelFromAgreementType(rows[0].type);
    if (body.payment_mode === 'check' && !allowsCheckPayment(channel)) {
      return NextResponse.json(
        { error: 'check payment is only available for print agreements' },
        { status: 400 },
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
