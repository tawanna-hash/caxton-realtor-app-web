import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function signatureMatches(body: string, supplied: string, verifier: string): boolean {
  const expected = createHmac('sha256', verifier).update(body, 'utf8').digest('base64');
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const verifier = process.env.QUICKBOOKS_WEBHOOK_VERIFIER?.trim();
  if (!verifier) {
    return NextResponse.json({ error: 'QuickBooks webhook is not configured.' }, { status: 503 });
  }
  const signature = req.headers.get('intuit-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature.' }, { status: 400 });
  }
  const body = await req.text();
  if (!signatureMatches(body, signature, verifier)) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  // Phase one treats QuickBooks as an outbound accounting destination.
  // Acknowledge verified change notifications without mutating local billing
  // records. Bidirectional reconciliation can be enabled after sandbox review.
  return NextResponse.json({ received: true });
}

