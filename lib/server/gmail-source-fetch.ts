/**
 * Fetch the source Gmail message for a queued gmail-sourced event.
 *
 * The Gmail message id is recovered from AdminCalendarEvent.externalId,
 * which the scanner formats as `gmail-<messageId>[-<n>]`. The body is
 * pulled live from Gmail (we don't store it) — see the review-source
 * route for the same technique this consolidates.
 *
 * Returns null when the event isn't Gmail-sourced, the id is
 * unparseable, no mailbox is connected, or the Gmail API errors. Never
 * throws — callers (batch PDF export) should be able to skip a single
 * failing snippet without failing the whole export.
 */

import type { AdminCalendarEvent } from './events-store';
import { getGmailClient } from './gmail-client';
import { extractMessageBody } from './gmail-event-scanner';
import { logger } from './logger';

export interface GmailEventSource {
  messageId: string;
  subject: string;
  from: string;
  receivedAt: string | null;
  body: string;
}

function readHeader(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
  name: string,
): string {
  const found = (headers ?? []).find((h) => (h.name ?? '').toLowerCase() === name);
  return found?.value ?? '';
}

export function extractGmailMessageIdFromExternalId(externalId: string): string | null {
  return /^gmail-(.+?)(?:-\d+)?$/.exec(externalId)?.[1] ?? null;
}

/** Fetch and shape the source email. Returns null on any failure. */
export async function fetchGmailEventSource(
  event: AdminCalendarEvent,
): Promise<GmailEventSource | null> {
  if (event.externalSource !== 'gmail') return null;
  const messageId = extractGmailMessageIdFromExternalId(event.externalId);
  if (!messageId) return null;

  try {
    const client = await getGmailClient();
    if (!client) return null;
    const res = await client.gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });
    const headers = res.data.payload?.headers ?? undefined;
    return {
      messageId,
      subject: readHeader(headers, 'subject') || '(no subject)',
      from: readHeader(headers, 'from'),
      receivedAt: res.data.internalDate
        ? new Date(parseInt(res.data.internalDate, 10)).toISOString()
        : null,
      body: extractMessageBody(res.data),
    };
  } catch (err) {
    logger.warn(
      { eventId: event.id, err: err instanceof Error ? err.message : String(err) },
      '[gmail-source-fetch] failed to fetch source email',
    );
    return null;
  }
}

/**
 * Fetch source emails for many events with a small concurrency cap.
 * Preserves input order; entries at indexes where the fetch failed are
 * null. Concurrency is deliberately low — Gmail's quota per user is
 * generous but sequential is too slow.
 */
export async function fetchGmailEventSources(
  events: AdminCalendarEvent[],
  concurrency = 4,
): Promise<Array<GmailEventSource | null>> {
  const out: Array<GmailEventSource | null> = new Array(events.length).fill(null);
  let next = 0;
  const workers: Array<Promise<void>> = [];
  for (let w = 0; w < Math.max(1, concurrency); w++) {
    workers.push(
      (async () => {
        while (true) {
          const i = next++;
          if (i >= events.length) return;
          out[i] = await fetchGmailEventSource(events[i]);
        }
      })(),
    );
  }
  await Promise.all(workers);
  return out;
}
