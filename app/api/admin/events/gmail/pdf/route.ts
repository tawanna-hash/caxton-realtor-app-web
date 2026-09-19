/**
 * GET /api/admin/events/gmail/pdf
 * Admin-only. Streams a PDF snapshot of the current pending Gmail
 * event queue with source email bodies included.
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { collectGmailQueuePdfInputs } from '@/lib/server/gmail-queue-pdf-inputs';
import { generateGmailQueuePdf } from '@/lib/gmail-queue-pdf';

export const runtime = 'nodejs';

export const GET = withAdminTracking(async () => {
  await requireAdmin();
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
