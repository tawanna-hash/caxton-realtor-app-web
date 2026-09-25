import { createHash } from 'node:crypto';
import { get, head } from '@vercel/blob';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { query } from '@/lib/server/db/neon';
import { requireUser } from '@/lib/server/auth/user';
import { getAgentCommandCenterWorkspace } from '@/lib/server/agent-command-center-workspaces';
import { ApiError, withErrorHandling } from '@/lib/server/error';
import { rateLimit } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 15 * 1024 * 1024;
const DEAL_ID_RE = /^[\w-]{1,120}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type ContractRow = { id: string; blob_path: string; deal_id: string };
let schemaReady: Promise<void> | undefined;

function privateStoreToken(): string {
  // A separately provisioned private store only. The app's default Blob token
  // may belong to a public media store and must never be used for contracts.
  const token = process.env.CLOSING_TIME_PRIVATE_BLOB_READ_WRITE_TOKEN;
  if (!token) throw new ApiError(503, 'Private contract storage is not configured.');
  return token;
}

function ensureOriginalsTable(): Promise<void> {
  if (!schemaReady) schemaReady = (async () => {
    await query(`
    CREATE TABLE IF NOT EXISTS closing_time_contract_originals (
      id UUID PRIMARY KEY,
      owner_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE,
      deal_id TEXT NOT NULL,
      blob_path TEXT NOT NULL UNIQUE,
      filename TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
    `);
    await query(`
    CREATE INDEX IF NOT EXISTS closing_time_contract_originals_owner_deal_idx
    ON closing_time_contract_originals (owner_id, deal_id, uploaded_at DESC)
    `);
  })().catch((error: unknown) => {
    schemaReady = undefined;
    throw error;
  });
  return schemaReady;
}

export const POST = withErrorHandling(async (request: Request): Promise<Response> => {
  const user = await requireUser();
  const token = privateStoreToken();
  await rateLimit('signWizard', user.realtorId);
  const body = await request.json() as { action?: string; dealId?: string; pathname?: string; filename?: string } & Partial<HandleUploadBody>;
  if (body.action === 'finalize') {
    const { dealId, pathname, filename } = body;
    const match = typeof pathname === 'string'
      ? /^closing-time\/originals\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.pdf$/i.exec(pathname)
      : null;
    if (!match || !UUID_RE.test(match[1]) || !UUID_RE.test(match[2]) || match[1] !== user.realtorId
      || !dealId || !DEAL_ID_RE.test(dealId) || typeof filename !== 'string' || !filename.trim()) {
      throw new ApiError(400, 'Invalid original contract.');
    }
    const workspace = await getAgentCommandCenterWorkspace(user.realtorId);
    if (!workspace?.workspace.deals.some(deal => deal.id === dealId && !deal.auditLocked)) {
      throw new ApiError(403, 'This transaction is unavailable or locked.');
    }
    const meta = await head(pathname!, { token });
    if (!meta || meta.size < 5 || meta.size > MAX_BYTES || meta.contentType !== 'application/pdf') {
      throw new ApiError(400, 'Choose a PDF smaller than 15 MB.');
    }
    const blob = await get(pathname!, { access: 'private', token, useCache: false });
    if (!blob?.stream) throw new ApiError(404, 'Original PDF is unavailable.');
    const bytes = Buffer.from(await new Response(blob.stream).arrayBuffer());
    if (bytes.length !== meta.size || bytes.subarray(0, 5).toString() !== '%PDF-') {
      throw new ApiError(400, 'The uploaded file is not a valid PDF.');
    }
    await ensureOriginalsTable();
    const id = match[2];
    const inserted = await query<{ id: string }>(
      `INSERT INTO closing_time_contract_originals (id, owner_id, deal_id, blob_path, filename, sha256, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [id, user.realtorId, dealId, pathname, filename.trim().slice(0, 280), createHash('sha256').update(bytes).digest('hex'), bytes.length],
    );
    if (!inserted.length) {
      const existing = await query<ContractRow>(
        `SELECT id, blob_path, deal_id FROM closing_time_contract_originals WHERE id = $1 AND owner_id = $2`,
        [id, user.realtorId],
      );
      if (existing[0]?.blob_path !== pathname || existing[0]?.deal_id !== dealId) {
        throw new ApiError(409, 'This contract identifier is already in use.');
      }
    }
    return NextResponse.json({ id }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  const response = await handleUpload({
    request,
    body: body as HandleUploadBody,
    token,
    onBeforeGenerateToken: async (pathname, payload) => {
      const match = /^closing-time\/originals\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.pdf$/i.exec(pathname);
      if (!match || !UUID_RE.test(match[1]) || !UUID_RE.test(match[2]) || match[1] !== user.realtorId) {
        throw new ApiError(400, 'Invalid contract path.');
      }
      const dealId = payload ?? '';
      const workspace = await getAgentCommandCenterWorkspace(user.realtorId);
      if (!DEAL_ID_RE.test(dealId) || !workspace?.workspace.deals.some(deal => deal.id === dealId && !deal.auditLocked)) {
        throw new ApiError(403, 'This transaction is unavailable or locked.');
      }
      return {
        allowedContentTypes: ['application/pdf'],
        maximumSizeInBytes: MAX_BYTES,
        allowOverwrite: false,
        addRandomSuffix: false,
        validUntil: Date.now() + 10 * 60 * 1000,
      };
    },
  });
  return NextResponse.json(response, { headers: { 'Cache-Control': 'private, no-store' } });
});

export const GET = withErrorHandling(async (request: Request): Promise<Response> => {
  const user = await requireUser();
  const token = privateStoreToken();
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const dealId = url.searchParams.get('dealId');
  if (id && !UUID_RE.test(id)) throw new ApiError(400, 'Invalid contract identifier.');
  if (!id && (!dealId || !DEAL_ID_RE.test(dealId))) throw new ApiError(400, 'Invalid contract request.');
  await ensureOriginalsTable();
  const rows = await query<ContractRow>(
    `SELECT id, blob_path, deal_id FROM closing_time_contract_originals
     WHERE owner_id = $1 AND ${id ? 'id = $2::uuid' : 'deal_id = $2'}
     ORDER BY uploaded_at DESC LIMIT 1`,
    [user.realtorId, id || dealId],
  );
  if (!rows.length) return NextResponse.json({ id: null }, { headers: { 'Cache-Control': 'private, no-store' } });
  if (!id) return NextResponse.json({ id: rows[0].id }, { headers: { 'Cache-Control': 'private, no-store' } });
  const result = await get(rows[0].blob_path, { access: 'private', token, useCache: false });
  if (!result?.stream) throw new ApiError(404, 'Original PDF is unavailable.');
  return new Response(result.stream, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="original-contract.pdf"',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
});
