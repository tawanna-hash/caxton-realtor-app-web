import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { extractTrecContract } from '@/lib/server/gemini-trec-contract-extract';
import { rateLimit } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

function privateResponse(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

export const POST = withErrorHandling(async (request: NextRequest): Promise<Response> => {
  // A contract may contain confidential transaction information. Require the
  // same signed-in user session that owns the destination agent workspace.
  await requireUser();
  await rateLimit('general', 'agent-trec-contract-extract');

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return privateResponse({ error: 'Invalid upload.' }, 400);
  }
  const file = formData.get('contract');
  if (!(file instanceof File)) {
    return privateResponse({ error: 'Choose a contract PDF, PNG, JPG, or WEBP file.' }, 400);
  }
  if (!ACCEPTED_TYPES.has(file.type)) {
    return privateResponse({ error: 'Use a PDF, PNG, JPG, or WEBP contract file.' }, 415);
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return privateResponse({ error: 'Use a contract file smaller than 15 MB.' }, 413);
  }

  // The source file remains in the request buffer only. It is not saved to
  // Blob, Neon, logs, or the server filesystem; only reviewed field values
  // return to the signed-in agent.
  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await extractTrecContract({
    base64: bytes.toString('base64'),
    mimeType: file.type,
  });
  if (!result.ok) {
    const status = result.reason === 'no-key' ? 503 : result.reason === 'rate-limit' ? 429 : 422;
    return privateResponse({ error: 'Could not read this contract.', reason: result.reason }, status);
  }

  return privateResponse({ extraction: result.data });
});
