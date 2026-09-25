import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { requireUser } from '@/lib/server/auth/user';
import { query, exec } from '@/lib/server/db/neon';
import { ApiError, withErrorHandling } from '@/lib/server/error';
import { rateLimit } from '@/lib/server/rate-limit';
import { getAgentCommandCenterWorkspace } from '@/lib/server/agent-command-center-workspaces';
import {
  emailSigningInvitation, ensureSigningSchema, newSigningToken,
  readPrivatePdf, sha256, type SigningEnvelope, type SigningParty,
} from '@/lib/server/closing-time-signing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noStore = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
function invitationOrigin(request: Request): string {
  const url = new URL(request.url);
  if (url.hostname === 'realtynewsnow.app' || url.hostname === 'www.realtynewsnow.app'
    || /^caxton-realtor-app-[a-z0-9-]+-tawanna-verocks-projects\.vercel\.app$/.test(url.hostname)) {
    return url.origin;
  }
  return 'https://realtynewsnow.app';
}

export const GET = withErrorHandling(async (request: Request): Promise<Response> => {
  const user = await requireUser();
  const url = new URL(request.url);
  const originalId = url.searchParams.get('originalId');
  const signedId = url.searchParams.get('signedId');
  const auditId = url.searchParams.get('auditId');
  if (!originalId && !signedId && !auditId || [originalId, signedId, auditId].some(id => id && !UUID_RE.test(id))) {
    throw new ApiError(400, 'Invalid contract identifier.');
  }
  await ensureSigningSchema();
  if (auditId) {
    const rows = await query<{
      original_sha256: string; current_sha256: string; parties: SigningParty[]; created_at: Date;
      party_index: number; party_email: string; method: string; signed_at: Date;
      ip_address: string; user_agent: string; prior_sha256: string; signed_sha256: string;
    }>(`SELECT e.original_sha256, e.current_sha256, e.parties, e.created_at,
       a.party_index, a.party_email, a.method, a.signed_at, a.ip_address, a.user_agent, a.prior_sha256, a.signed_sha256
       FROM closing_time_signing_envelopes e JOIN closing_time_signing_audit a ON a.envelope_id = e.id
       WHERE e.id = $1 AND e.owner_id = $2 ORDER BY a.party_index`, [auditId, user.realtorId]);
    return NextResponse.json({ envelopeId: auditId, events: rows }, { headers: noStore });
  }
  if (signedId) {
    const rows = await query<SigningEnvelope>(
      `SELECT * FROM closing_time_signing_envelopes WHERE id = $1 AND owner_id = $2 AND status = 'complete'`, [signedId, user.realtorId],
    );
    if (!rows.length) throw new ApiError(404, 'Signed contract is unavailable.');
    const bytes = await readPrivatePdf(rows[0].current_path, rows[0].current_sha256);
    return new Response(new Uint8Array(bytes), {
      headers: { ...noStore, 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="signed-contract.pdf"' },
    });
  }
  const rows = await query<SigningEnvelope>(
    `SELECT * FROM closing_time_signing_envelopes WHERE original_id = $1 AND owner_id = $2 ORDER BY created_at DESC LIMIT 10`,
    [originalId, user.realtorId],
  );
  return NextResponse.json({
    envelopes: rows.map(row => ({ id: row.id, status: row.status, step: row.step, parties: row.parties, createdAt: row.created_at })),
  }, { headers: noStore });
});

export const POST = withErrorHandling(async (request: Request): Promise<Response> => {
  const user = await requireUser();
  await rateLimit('signWizard', user.realtorId);
  const body = await request.json() as { action?: string; originalId?: string; envelopeId?: string; parties?: SigningParty[] };
  await ensureSigningSchema();
  const origin = invitationOrigin(request);
  if (body.action === 'resend') {
    if (!body.envelopeId || !UUID_RE.test(body.envelopeId)) throw new ApiError(400, 'Invalid signing request.');
    const rows = await query<SigningEnvelope>(
      `SELECT * FROM closing_time_signing_envelopes WHERE id = $1 AND owner_id = $2
       AND (status = 'active' OR (status = 'processing' AND processing_started_at < now() - interval '10 minutes'))`,
      [body.envelopeId, user.realtorId],
    );
    if (!rows.length) throw new ApiError(404, 'Signing request is unavailable.');
    const token = newSigningToken();
    await exec(
      `UPDATE closing_time_signing_envelopes
       SET token_hash = $1, token_expires_at = now() + interval '7 days', status = 'active', processing_started_at = NULL
       WHERE id = $2 AND owner_id = $3
       AND (status = 'active' OR (status = 'processing' AND processing_started_at < now() - interval '10 minutes'))`,
      [sha256(token), rows[0].id, user.realtorId],
    );
    const sent = await emailSigningInvitation(rows[0], token, origin);
    if (!sent) throw new ApiError(503, 'Invitation could not be sent. Use Resend invitation to try again.');
    return NextResponse.json({ sent: true }, { headers: noStore });
  }
  if (body.action !== 'create' || !body.originalId || !UUID_RE.test(body.originalId)
    || !Array.isArray(body.parties) || body.parties.length < 1 || body.parties.length > 8) {
    throw new ApiError(400, 'Add 1 to 8 parties and choose an original PDF.');
  }
  const originals = await query<{ blob_path: string; sha256: string; deal_id: string }>(
    `SELECT blob_path, sha256, deal_id FROM closing_time_contract_originals WHERE id = $1 AND owner_id = $2`,
    [body.originalId, user.realtorId],
  );
  if (!originals.length) throw new ApiError(404, 'Original contract is unavailable.');
  const workspace = await getAgentCommandCenterWorkspace(user.realtorId);
  if (!workspace?.workspace.deals.some(deal => deal.id === originals[0].deal_id && !deal.auditLocked)) {
    throw new ApiError(403, 'This transaction is unavailable or locked.');
  }
  const bytes = await readPrivatePdf(originals[0].blob_path, originals[0].sha256);
  if (/\/ByteRange\s*\[\s*\d+\s+\d+\s+\d+\s+\d+/i.test(bytes.toString('latin1'))) {
    throw new ApiError(422, 'This PDF already has a cryptographic signature. Keep the unchanged original; use an unsigned copy for new signatures.');
  }
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false });
  const pages = pdf.getPages();
  const parties = body.parties.map(party => ({
    name: String(party.name ?? '').trim().slice(0, 120),
    email: String(party.email ?? '').trim().toLowerCase().slice(0, 250),
    page: Number(party.page), x: Number(party.x), y: Number(party.y),
  }));
  if (parties.some(party => !party.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(party.email)
    || !Number.isInteger(party.page) || party.page < 1 || party.page > pages.length
    || !Number.isFinite(party.x) || !Number.isFinite(party.y)
    || party.x < 0 || party.x > .7 || party.y < 0 || party.y > .93)) {
    throw new ApiError(400, 'Check each party’s email and signature placement.');
  }
  const active = await query<{ id: string }>(
    `SELECT id FROM closing_time_signing_envelopes WHERE original_id = $1 AND owner_id = $2 AND status IN ('active', 'processing') LIMIT 1`,
    [body.originalId, user.realtorId],
  );
  if (active.length) throw new ApiError(409, 'Finish or cancel the existing signing request first.');
  const id = randomUUID();
  const token = newSigningToken();
  const rows = await query<SigningEnvelope>(
    `INSERT INTO closing_time_signing_envelopes
      (id, owner_id, original_id, original_sha256, current_path, current_sha256, parties, token_hash, token_expires_at)
     VALUES ($1, $2, $3, $4, $5, $4, $6::jsonb, $7, now() + interval '7 days') RETURNING *`,
    [id, user.realtorId, body.originalId, originals[0].sha256, originals[0].blob_path, JSON.stringify(parties), sha256(token)],
  );
  const sent = await emailSigningInvitation(rows[0], token, origin);
  return NextResponse.json({ id, sent, message: sent ? 'First invitation sent.' : 'Signing request saved. Use Resend invitation to send it.' },
    { status: 201, headers: noStore });
});
