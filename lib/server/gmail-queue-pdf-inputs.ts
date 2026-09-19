/**
 * Collect PDF-generator inputs: pending Gmail events + per-event
 * confidence score. The DB column exists but AdminCalendarEvent's
 * SELECT_COLS doesn't project it, so we look it up here.
 *
 * Source email bodies are intentionally NOT fetched — the PDF export
 * only ships event details (what/when/where/who), never the raw email.
 */

import { query } from './db/neon';
import { listPendingGmailEvents } from './events-store';
import type { GmailQueuePdfInput } from '@/lib/gmail-queue-pdf';

export async function collectGmailQueuePdfInputs(): Promise<GmailQueuePdfInput[]> {
  const events = await listPendingGmailEvents();
  if (events.length === 0) return [];

  const ids = events.map((e) => e.id);
  const rows = await query<{ id: number; confidence: number | null }>(
    `SELECT id, confidence FROM events WHERE id = ANY($1::int[])`,
    [ids],
  );
  const confidenceById = new Map(rows.map((r) => [r.id, r.confidence]));

  return events.map((event) => ({
    event,
    confidence: confidenceById.get(event.id) ?? null,
  }));
}
