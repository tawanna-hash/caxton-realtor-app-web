// app/api/sign/[token]/route.ts
//
// Public (no admin auth) sign API — the HMAC token IS the auth.
//
// POST — Apply digital signature to agreement.
// PATCH — Update advertiser/billing fields (allowlisted).

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { verifyToken } from '@/lib/sign-token';
import { appendAudit, type Agreement } from '@/lib/agreements';
import { autoCreateForAgreement } from '@/lib/renewal-reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ token: string }> };

// Fields the advertiser is allowed to update via PATCH
const SIGN_PATCHABLE = new Set([
  'company_name', 'rep_name', 'advertiser_email', 'advertiser_phone',
  'address', 'city', 'state', 'zip',
  'billing_email', 'billing_contact_name', 'billing_contact_phone',
]);

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { token } = await ctx.params;
  const parsed = verifyToken(token);
  if (!parsed) return NextResponse.json({ error: 'invalid or expired token' }, { status: 401 });
  const { agreementId: id } = parsed;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const signerName = typeof body.signerName === 'string' ? body.signerName.trim() : '';
  const signedAt = typeof body.signedAt === 'string' ? body.signedAt : new Date().toISOString().slice(0, 10);
  const termsAccepted = body.termsAccepted === true;

  if (!signerName) return NextResponse.json({ error: 'signerName is required' }, { status: 400 });
  if (!termsAccepted) return NextResponse.json({ error: 'termsAccepted must be true' }, { status: 400 });

  try {
    await ensureSchema();
    const sql = getSql();

    const rows = await sql`SELECT * FROM agreements WHERE id = ${id}` as unknown as Agreement[];
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const ag = rows[0];

    const signedAtTs = signedAt.length === 10 ? `${signedAt}T00:00:00.000Z` : signedAt;
    const now = new Date().toISOString();

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
    const newLog = appendAudit(ag.audit_log, {
      event: 'signed',
      timestamp: now,
      details: `Digitally signed by "${signerName}" via sign wizard`,
    });
    await sql`UPDATE agreements SET audit_log = ${JSON.stringify(newLog)}::jsonb WHERE id = ${id}`;

    // Fetch updated agreement for reminder creation
    const updatedRows = await sql`SELECT * FROM agreements WHERE id = ${id}` as unknown as Agreement[];
    if (updatedRows.length > 0 && updatedRows[0].exp_date) {
      await autoCreateForAgreement(updatedRows[0]).catch((e: unknown) => {
        console.error('[api/sign POST] autoCreateForAgreement failed', e instanceof Error ? e.message : String(e));
      });
    }

    return NextResponse.json({ ok: true });
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

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();

    const rows = await sql`SELECT id FROM agreements WHERE id = ${id}` as unknown as { id: string }[];
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const updates: string[] = [];
    for (const field of Object.keys(body)) {
      if (!SIGN_PATCHABLE.has(field)) continue;
      const val = body[field];
      if (typeof val !== 'string' && val !== null) continue;

      switch (field) {
        case 'company_name':          await sql`UPDATE agreements SET company_name = ${val}          WHERE id = ${id}`; break;
        case 'rep_name':              await sql`UPDATE agreements SET rep_name = ${val}              WHERE id = ${id}`; break;
        case 'advertiser_email':      await sql`UPDATE agreements SET advertiser_email = ${val}      WHERE id = ${id}`; break;
        case 'advertiser_phone':      await sql`UPDATE agreements SET advertiser_phone = ${val}      WHERE id = ${id}`; break;
        case 'address':               await sql`UPDATE agreements SET address = ${val}               WHERE id = ${id}`; break;
        case 'city':                  await sql`UPDATE agreements SET city = ${val}                  WHERE id = ${id}`; break;
        case 'state':                 await sql`UPDATE agreements SET state = ${val}                 WHERE id = ${id}`; break;
        case 'zip':                   await sql`UPDATE agreements SET zip = ${val}                   WHERE id = ${id}`; break;
        case 'billing_email':         await sql`UPDATE agreements SET billing_email = ${val}         WHERE id = ${id}`; break;
        case 'billing_contact_name':  await sql`UPDATE agreements SET billing_contact_name = ${val}  WHERE id = ${id}`; break;
        case 'billing_contact_phone': await sql`UPDATE agreements SET billing_contact_phone = ${val} WHERE id = ${id}`; break;
      }
      updates.push(field);
    }

    await sql`UPDATE agreements SET updated_at = NOW() WHERE id = ${id}`;

    return NextResponse.json({ ok: true, updated: updates });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'patch failed', detail: msg }, { status: 500 });
  }
}
