import { randomUUID } from 'node:crypto';
import { put } from '@vercel/blob';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { NextResponse } from 'next/server';
import { query, exec, withNeonTransaction } from '@/lib/server/db/neon';
import { ApiError, withErrorHandling } from '@/lib/server/error';
import { rateLimit } from '@/lib/server/rate-limit';
import {
  emailSigningInvitation, ensureSigningSchema, newSigningToken, privateContractToken,
  readPrivatePdf, sha256, type SigningEnvelope,
} from '@/lib/server/closing-time-signing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Context = { params: Promise<{ token: string }> };
const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };

async function envelopeForToken(token: string): Promise<SigningEnvelope> {
  if (!/^[a-zA-Z0-9_-]{40,60}$/.test(token)) throw new ApiError(404, 'Invitation is unavailable.');
  await ensureSigningSchema();
  const rows = await query<SigningEnvelope>(
    `SELECT * FROM closing_time_signing_envelopes WHERE token_hash = $1 AND token_expires_at > now()
     AND status = 'active' LIMIT 1`, [sha256(token)],
  );
  if (!rows.length) throw new ApiError(404, 'Invitation has expired or has already been used.');
  return rows[0];
}

export const GET = withErrorHandling(async (request: Request, context: Context): Promise<Response> => {
  const { token } = await context.params;
  await rateLimit('signWizard', `closing-sign:${sha256(token).slice(0, 20)}`);
  const envelope = await envelopeForToken(token);
  const party = envelope.parties[envelope.step];
  if (!party) throw new ApiError(404, 'Invitation is unavailable.');
  if (new URL(request.url).searchParams.has('pdf')) {
    const bytes = await readPrivatePdf(envelope.current_path, envelope.current_sha256);
    return new Response(new Uint8Array(bytes), {
      headers: { ...headers, 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="contract-to-review.pdf"' },
    });
  }
  return NextResponse.json({
    name: party.name, page: party.page, x: party.x, y: party.y,
    position: envelope.step + 1, total: envelope.parties.length,
  }, { headers });
});

export const POST = withErrorHandling(async (request: Request, context: Context): Promise<Response> => {
  const { token } = await context.params;
  await rateLimit('signWizard', `closing-sign:${sha256(token).slice(0, 20)}`);
  const envelope = await envelopeForToken(token);
  const body = await request.json() as { name?: string; agreed?: boolean; method?: string; signature?: string };
  const party = envelope.parties[envelope.step];
  if (!party || body.agreed !== true || body.name?.trim().toLowerCase() !== party.name.toLowerCase()) {
    throw new ApiError(400, 'Confirm the signer name and consent before signing.');
  }
  if (!['type', 'draw', 'upload'].includes(body.method ?? '') || !body.signature || body.signature.length > 1_500_000) {
    throw new ApiError(400, 'Add a signature by typing, drawing, or uploading an image.');
  }
  const method = body.method as 'type' | 'draw' | 'upload';
  if (method === 'type' && (body.signature.trim().toLowerCase() !== party.name.toLowerCase() || body.signature.length > 120)) {
    throw new ApiError(400, 'Typed signature must match the invited signer.');
  }
  // Consume the invitation before writing. Only one concurrent request may sign.
  const reserved = await exec(
    `UPDATE closing_time_signing_envelopes SET status = 'processing', processing_started_at = now()
     WHERE id = $1 AND token_hash = $2 AND status = 'active' AND step = $3 RETURNING id`,
    [envelope.id, sha256(token), envelope.step],
  );
  if (!reserved.rowCount) throw new ApiError(409, 'This invitation is already being signed.');
  try {
    const original = await readPrivatePdf(envelope.current_path, envelope.current_sha256);
    const pdf = await PDFDocument.load(original, { ignoreEncryption: false });
    const page = pdf.getPage(party.page - 1);
    if (!page) throw new ApiError(422, 'Signature page is unavailable.');
    const { width, height } = page.getSize();
    const x = party.x * width;
    const y = (1 - party.y) * height - 35;
    if (method === 'type') {
      const font = await pdf.embedFont(StandardFonts.TimesRomanItalic);
      page.drawText(party.name, { x, y: y + 7, size: 20, font, color: rgb(.09, .1, .22), maxWidth: Math.min(190, width - x - 10) });
    } else {
      const imageMatch = /^data:image\/(png|jpeg);base64,([a-zA-Z0-9+/=]+)$/.exec(body.signature);
      if (!imageMatch) throw new ApiError(400, 'Signature image must be PNG or JPEG.');
      const imageBytes = Buffer.from(imageMatch[2], 'base64');
      if (!imageBytes.length || imageBytes.length > 1_000_000) throw new ApiError(413, 'Signature image is too large.');
      const image = imageMatch[1] === 'png' ? await pdf.embedPng(imageBytes) : await pdf.embedJpg(imageBytes);
      const scale = Math.min(190 / image.width, 36 / image.height, 1);
      page.drawImage(image, { x, y, width: image.width * scale, height: image.height * scale });
    }
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const signedAt = new Date().toISOString();
    page.drawText(`Electronically signed ${signedAt.slice(0, 16).replace('T', ' ')} UTC`, {
      x, y: Math.max(2, y - 10), size: 6, font, color: rgb(.2, .2, .2), maxWidth: Math.min(190, width - x - 10),
    });
    const bytes = Buffer.from(await pdf.save());
    if (bytes.length > 30 * 1024 * 1024) throw new ApiError(413, 'Signed PDF is too large.');
    const path = `closing-time/signed/${envelope.owner_id}/${envelope.id}/${envelope.step}-${randomUUID()}.pdf`;
    await put(path, bytes, { access: 'private', token: privateContractToken(), contentType: 'application/pdf', addRandomSuffix: false });
    const next = envelope.step + 1;
    const nextToken = next < envelope.parties.length ? newSigningToken() : null;
    const parties = envelope.parties.map((p, i) => i === envelope.step ? { ...p, signedAt } : p);
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 60) ?? '';
    await withNeonTransaction(async client => {
      const updated = await client.query(
        `UPDATE closing_time_signing_envelopes
         SET current_path = $1, current_sha256 = $2, parties = $3::jsonb, step = $4, status = $5,
             processing_started_at = NULL,
             token_hash = $6, token_expires_at = CASE WHEN $6::text IS NULL THEN NULL ELSE now() + interval '7 days' END
         WHERE id = $7 AND status = 'processing' AND step = $8 RETURNING id`,
        [path, sha256(bytes), JSON.stringify(parties), next, nextToken ? 'active' : 'complete',
          nextToken ? sha256(nextToken) : null, envelope.id, envelope.step],
      );
      if (!updated.rowCount) throw new ApiError(409, 'Signing state changed. Contact your agent.');
      await client.query(`
        INSERT INTO closing_time_signing_audit
          (id, envelope_id, party_index, party_email, method, signed_at, ip_address, user_agent, prior_sha256, signed_sha256)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [randomUUID(), envelope.id, envelope.step, party.email, method, signedAt, ip,
          (request.headers.get('user-agent') ?? '').slice(0, 500), envelope.current_sha256, sha256(bytes)],
      );
    });
    let nextSent = true;
    if (nextToken) {
      const site = new URL(request.url);
      const origin = site.hostname === 'realtynewsnow.app' || site.hostname === 'www.realtynewsnow.app'
        || /^caxton-realtor-app-[a-z0-9-]+-tawanna-verocks-projects\.vercel\.app$/.test(site.hostname)
        ? site.origin : 'https://realtynewsnow.app';
      nextSent = await emailSigningInvitation({ ...envelope, parties, step: next }, nextToken, origin);
    }
    return NextResponse.json({ signed: true, complete: !nextToken, nextSent }, { headers });
  } catch (error) {
    await exec(
      `UPDATE closing_time_signing_envelopes SET status = 'active', processing_started_at = NULL WHERE id = $1 AND status = 'processing' AND step = $2`,
      [envelope.id, envelope.step],
    );
    throw error;
  }
});
