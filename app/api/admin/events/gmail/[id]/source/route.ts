/**
 * /api/admin/events/gmail/:id/source
 *
 * GET — the email a queued event was extracted from, so a reviewer can check
 *       the scanner's work before approving.
 *
 * The body is fetched from Gmail on demand rather than copied into the events
 * table: it can run to tens of KB per message, it's only ever read during
 * review, and re-reading keeps us from storing message content we don't need.
 * The Gmail message id is recovered from external_id (`gmail-<id>[-<n>]`).
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { ApiError } from '@/lib/server/error';
import { getEventById } from '@/lib/server/events-store';
import { eventIdParamSchema } from '@/lib/server/schemas/events';
import { getGmailClient } from '@/lib/server/gmail-client';
import { extractMessageBody } from '@/lib/server/gmail-event-scanner';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

function header(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
  name: string,
): string {
  const found = (headers ?? []).find((h) => (h.name ?? '').toLowerCase() === name);
  return found?.value ?? '';
}

export const GET = withAdminTracking(async (_req: Request, ctx: Ctx) => {
  await requireAdmin();
  const { id } = eventIdParamSchema.parse(await ctx.params);

  const event = await getEventById(id);
  if (!event || event.externalSource !== 'gmail') {
    throw new ApiError(404, 'Gmail-sourced event not found');
  }

  const messageId = /^gmail-(.+?)(?:-\d+)?$/.exec(event.externalId)?.[1];
  if (!messageId) throw new ApiError(422, 'Event has no recoverable Gmail message id');

  const client = await getGmailClient();
  if (!client) throw new ApiError(400, 'No Gmail mailbox is connected.');

  const res = await client.gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  const headers = res.data.payload?.headers ?? undefined;
  return NextResponse.json({
    messageId,
    subject: header(headers, 'subject') || '(no subject)',
    from: header(headers, 'from'),
    receivedAt: res.data.internalDate
      ? new Date(parseInt(res.data.internalDate, 10)).toISOString()
      : null,
    body: extractMessageBody(res.data),
  });
});
