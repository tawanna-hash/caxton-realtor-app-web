import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { requireUser } from '@/lib/server/auth/user';
import { query } from '@/lib/server/db/neon';
import { withErrorHandling } from '@/lib/server/error';
import { extractTrecContract } from '@/lib/server/gemini-trec-contract-extract';
import { getActiveTrecFormVersion, getTrecFormVersion } from '@/lib/server/trec-form-versions';
import { rateLimit } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function privateResponse(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

export const POST = withErrorHandling(async (request: NextRequest): Promise<Response> => {
  // A contract may contain confidential transaction information. Require the
  // same signed-in user session that owns the destination agent workspace.
  const user = await requireUser();
  await rateLimit('general', 'agent-trec-contract-extract');

  let bytes: Buffer;
  let mimeType: string;
  let requestedVersionId: string;
  if (request.headers.get('content-type')?.startsWith('application/json')) {
    let body: { originalId?: string; trecFormVersionId?: string };
    try {
      body = await request.json();
    } catch {
      return privateResponse({ error: 'Invalid contract request.' }, 400);
    }
    if (!body.originalId || !UUID_RE.test(body.originalId)) {
      return privateResponse({ error: 'Invalid original contract.' }, 400);
    }
    const token = process.env.CLOSING_TIME_PRIVATE_BLOB_READ_WRITE_TOKEN;
    if (!token) return privateResponse({ error: 'Private contract storage is not configured.' }, 503);
    const rows = await query<{ blob_path: string; size_bytes: number }>(
      `SELECT blob_path, size_bytes FROM closing_time_contract_originals WHERE id = $1::uuid AND owner_id = $2 LIMIT 1`,
      [body.originalId, user.realtorId],
    );
    if (!rows.length || rows[0].size_bytes > MAX_BYTES) {
      return privateResponse({ error: 'Original contract is unavailable.' }, 404);
    }
    const blob = await get(rows[0].blob_path, { access: 'private', token, useCache: false });
    if (!blob?.stream) return privateResponse({ error: 'Original contract is unavailable.' }, 404);
    bytes = Buffer.from(await new Response(blob.stream).arrayBuffer());
    if (bytes.length !== rows[0].size_bytes || bytes.subarray(0, 5).toString() !== '%PDF-') {
      return privateResponse({ error: 'Original contract could not be verified.' }, 422);
    }
    mimeType = 'application/pdf';
    requestedVersionId = String(body.trecFormVersionId ?? '').trim();
  } else {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return privateResponse({ error: 'Invalid upload.' }, 400);
    }
    const file = formData.get('contract');
    requestedVersionId = String(formData.get('trecFormVersionId') ?? '').trim();
    if (!(file instanceof File)) {
      return privateResponse({ error: 'Choose a contract PDF, PNG, JPG, or WEBP file.' }, 400);
    }
    if (!ACCEPTED_TYPES.has(file.type)) {
      return privateResponse({ error: 'Use a PDF, PNG, JPG, or WEBP contract file.' }, 415);
    }
    if (file.size === 0 || file.size > MAX_BYTES) {
      return privateResponse({ error: 'Use a contract file smaller than 15 MB.' }, 413);
    }
    // Images remain transient. PDFs use the private-store path above.
    bytes = Buffer.from(await file.arrayBuffer());
    mimeType = file.type;
  }
  const trecFormVersion = requestedVersionId
    ? await getTrecFormVersion(requestedVersionId)
    : await getActiveTrecFormVersion();
  if (!trecFormVersion) return privateResponse({ error: 'This transaction’s TREC form version is no longer available.' }, 409);
  const result = await extractTrecContract({
    base64: bytes.toString('base64'),
    mimeType,
    fields: trecFormVersion.fields,
    formNumber: trecFormVersion.formNumber,
  });
  if (!result.ok) {
    const status = result.reason === 'no-key' ? 503 : result.reason === 'rate-limit' ? 429 : 422;
    return privateResponse({ error: 'Could not read this contract.', reason: result.reason }, status);
  }

  return privateResponse({ extraction: result.data });
});
