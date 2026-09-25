import { createHash, randomBytes } from 'node:crypto';
import { get } from '@vercel/blob';
import { query } from '@/lib/server/db/neon';
import { ApiError } from '@/lib/server/error';
import { sendEmail } from '@/lib/email';

export type SigningParty = {
  name: string;
  email: string;
  page: number;
  x: number;
  y: number;
  signedAt?: string;
};
export type SigningEnvelope = {
  id: string;
  owner_id: string;
  original_id: string;
  original_sha256: string;
  current_path: string;
  current_sha256: string;
  parties: SigningParty[];
  step: number;
  token_hash: string | null;
  token_expires_at: Date | null;
  status: 'active' | 'processing' | 'complete' | 'cancelled';
  created_at: Date;
};
let ready: Promise<void> | undefined;
export function privateContractToken(): string {
  const token = process.env.CLOSING_TIME_PRIVATE_BLOB_READ_WRITE_TOKEN;
  if (!token) throw new ApiError(503, 'Private contract storage is not configured.');
  return token;
}
export function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}
export function newSigningToken(): string {
  return randomBytes(32).toString('base64url');
}
export async function ensureSigningSchema(): Promise<void> {
  if (!ready) ready = (async () => {
    await query(`
    CREATE TABLE IF NOT EXISTS closing_time_signing_envelopes (
      id UUID PRIMARY KEY,
      owner_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE,
      original_id UUID NOT NULL REFERENCES closing_time_contract_originals(id),
      original_sha256 TEXT NOT NULL,
      current_path TEXT NOT NULL,
      current_sha256 TEXT NOT NULL,
      parties JSONB NOT NULL,
      step INTEGER NOT NULL DEFAULT 0,
      token_hash TEXT,
      token_expires_at TIMESTAMPTZ,
      processing_started_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
    `);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS closing_time_one_open_envelope_idx
      ON closing_time_signing_envelopes (original_id) WHERE status IN ('active', 'processing')`);
    await query(`
      CREATE TABLE IF NOT EXISTS closing_time_signing_audit (
        id UUID PRIMARY KEY,
        envelope_id UUID NOT NULL REFERENCES closing_time_signing_envelopes(id),
        party_index INTEGER NOT NULL,
        party_email TEXT NOT NULL,
        method TEXT NOT NULL,
        signed_at TIMESTAMPTZ NOT NULL,
        ip_address TEXT NOT NULL,
        user_agent TEXT NOT NULL,
        prior_sha256 TEXT NOT NULL,
        signed_sha256 TEXT NOT NULL,
        UNIQUE(envelope_id, party_index)
      )
    `);
  })().catch(error => { ready = undefined; throw error; });
  await ready;
}
export async function readPrivatePdf(path: string, expectedHash?: string): Promise<Buffer> {
  const blob = await get(path, { access: 'private', token: privateContractToken(), useCache: false });
  if (!blob?.stream) throw new ApiError(404, 'Contract PDF is unavailable.');
  const bytes = Buffer.from(await new Response(blob.stream).arrayBuffer());
  if (bytes.length < 5 || bytes.length > 30 * 1024 * 1024 || bytes.subarray(0, 5).toString() !== '%PDF-'
    || (expectedHash && sha256(bytes) !== expectedHash)) {
    throw new ApiError(422, 'Contract integrity check failed.');
  }
  return bytes;
}
export async function emailSigningInvitation(envelope: SigningEnvelope, token: string, origin: string): Promise<boolean> {
  const party = envelope.parties[envelope.step];
  if (!party) return false;
  const url = `${origin}/closing-sign/${encodeURIComponent(token)}`;
  const result = await sendEmail({
    to: party.email,
    subject: 'Please review and sign your contract',
    html: `<p>Hello ${escapeHtml(party.name)},</p><p>You have been invited to review and electronically sign a contract.</p><p><a href="${escapeHtml(url)}">Review and sign the contract</a></p><p>This private invitation expires in 7 days. Do not forward it. If you did not expect this, contact the agent who invited you.</p>`,
  });
  return result.ok;
}
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}
