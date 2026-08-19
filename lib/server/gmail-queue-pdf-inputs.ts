/**
 * Collect the inputs the PDF generator needs: the pending Gmail event
 * list, each event's source email (fetched live from Gmail), and each
 * event's confidence score (which lives in the DB but isn't projected
 * by the shared events SELECT_COLS, so we look it up here).
 */

import { query } from './db/neon';
import { listPendingGmailEvents } from './events-store';
import { fetchGmailEventSources } from './gmail-source-fetch';
import type { GmailQueuePdfInput } from '@/lib/gmail-queue-pdf';

export async function collectGmailQueuePdfInputs(): Promise<GmailQueuePdfInput[]> {
  const events = await listPendingGmailEvents();
  if (events.length === 0) return [];

  const ids = events.map((e) => e.id);
  // Supplemental read for confidence (not in AdminCalendarEvent projection).
  const rows = await query<{ id: number; confidence: number | null }>(
    `SELECT id, confidence FROM events WHERE id = ANY($1::int[])`,
    [ids],
  );
  const confidenceById = new Map(rows.map((r) => [r.id, r.confidence]));

  const sources = await fetchGmailEventSources(events);

  return events.map((event, i) => ({
    event,
    source: sources[i],
    confidence: confidenceById.get(event.id) ?? null,
  }));
}
