// app/api/sign/[token]/approve/route.ts
//
// Public (no admin auth) proposal-approval API — the HMAC token IS the auth.
// Client clicks "Approve Proposal" in the portal:
//   - applies any last-second IO edits (allowlisted patches),
//   - flips status proposal_sent -> proposal_approved,
//   - notifies Tawanna to send the final agreement for signature.
//
// Nothing is signed here. The binding signature happens later, after Tawanna
// sends the final agreement (status proposal_approved -> sent -> signed).

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { verifyToken } from '@/lib/sign-token';
import { appendAudit, type Agreement, type AgreementAuditEntry } from '@/lib/agreements';
import { applyPatches } from '@/lib/server/agreement-patches';
import { notifyProposalApproved } from '@/lib/server/proposal-approved-notify';
import { rateLimit } from '@/lib/server/rate-limit';
import { ApiError } from '@/lib/server/error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ token: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { token } = await ctx.params;
  const parsed = verifyToken(token);
  if (!parsed) return NextResponse.json({ error: 'invalid or expired token' }, { status: 401 });
  const { agreementId: id } = parsed;

  try {
    await rateLimit('signWizard', id);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 429) {
      return NextResponse.json({ error: 'too many requests' }, { status: 429 });
    }
    throw err;
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* no body is fine */ }

  const patches = body.patches && typeof body.patches === 'object' && !Array.isArray(body.patches)
    ? body.patches as Record<string, unknown>
    : null;
  const approverName = typeof body.approverName === 'string' ? body.approverName.trim() : '';

  try {
    await ensureSchema();
    const sql = getSql();

    const rows = await sql`SELECT * FROM agreements WHERE id = ${id}` as unknown as Agreement[];
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const ag = rows[0];

    // Only a proposal that has been sent to the client can be approved.
    if (ag.status !== 'proposal_sent') {
      return NextResponse.json(
        { error: `proposal cannot be approved from status '${ag.status}'` , status: ag.status },
        { status: 409 },
      );
    }

    // Apply any last-second IO edits the client made before approving.
    if (patches) {
      await applyPatches(sql, id, patches);
    }

    const now = new Date().toISOString();
    await sql`
      UPDATE agreements
      SET status = 'proposal_approved',
          updated_at = NOW()
      WHERE id = ${id}
    `;

    const approver = approverName || ag.rep_name || ag.advertiser_email || '(unknown)';
    const newLog = appendAudit(ag.audit_log, {
      event: 'proposal_approved',
      timestamp: now,
      details: `Proposal approved by "${approver}" via sign portal. Awaiting rep to send the final agreement for signature.`,
    } as AgreementAuditEntry);
    await sql`UPDATE agreements SET audit_log = ${JSON.stringify(newLog)}::jsonb WHERE id = ${id}`;

    // Email Tawanna so she can review + send the final agreement.
    const refreshed = await sql`SELECT * FROM agreements WHERE id = ${id}` as unknown as Agreement[];
    if (refreshed.length > 0) {
      try {
        await notifyProposalApproved(refreshed[0]);
      } catch (e) {
        console.error('[api/sign approve] notifyProposalApproved failed', e instanceof Error ? e.message : String(e));
      }
    }

    return NextResponse.json({ ok: true, status: 'proposal_approved' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'approve failed', detail: msg }, { status: 500 });
  }
}
