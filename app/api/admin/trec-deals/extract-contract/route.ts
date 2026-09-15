import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { extractTrecContract } from '@/lib/server/gemini-trec-contract-extract';
import { rateLimit } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

export const POST = withAdminTracking(async function POST(request: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await rateLimit('general', 'trec-contract-extract');

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 });
  }
  const file = formData.get('contract');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Choose a contract PDF, PNG, JPG, or WEBP file.' }, { status: 400 });
  }
  if (!ACCEPTED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Use a PDF, PNG, JPG, or WEBP contract file.' }, { status: 415 });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Use a contract file smaller than 15 MB.' }, { status: 413 });
  }

  // The file is intentionally held only in this request buffer and never
  // written to Blob, the database, logs, or a local filesystem.
  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await extractTrecContract({ base64: bytes.toString('base64'), mimeType: file.type });
  if (!result.ok) {
    const status = result.reason === 'no-key' ? 503 : result.reason === 'rate-limit' ? 429 : 422;
    return NextResponse.json({ error: 'Could not read this contract.', reason: result.reason }, { status });
  }

  return NextResponse.json({ extraction: result.data });
});
