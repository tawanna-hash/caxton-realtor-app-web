/**
 * GET /api/admin/events/gmail/shared/[token]/pdf
 * PUBLIC (behind an unguessable signed token). Same generator as the
 * admin-only PDF route.
 */

import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/server/error';
import { verifyGmailShareToken } from '@/lib/server/gmail-share-token';
import { collectGmailQueuePdfInputs } from '@/lib/server/gmail-queue-pdf-inputs';
import { generateGmailQueuePdf } from '@/lib/gmail-queue-pdf';

export const runtime = 'nodejs';

interface RouteCtx {
  params: Promise<{ token: string }>;
}

export const GET = withErrorHandling(async (_req: Request, ctx: RouteCtx) => {
  const { token } = await ctx.params;
  const claim = verifyGmailShareToken(token);
  if (!claim) return NextResponse.json({ error: 'Invalid or expired share link' }, { status: 403 });
  const items = await collectGmailQueuePdfInputs();
  const pdf = await generateGmailQueuePdf(items);
  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="gmail-event-review-${new Date().toISOString().slice(0, 10)}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
});
