// lib/server/posthog.ts
//
// Server-side PostHog capture. Mirrors the client-side trackEvent API
// (from app/posthog-provider.tsx) so producer code can fire the same
// analytics events from API routes, cron jobs, and other Node contexts.
//
// Uses posthog-node with the public project key (NEXT_PUBLIC_POSTHOG_KEY)
// — same key the browser uses. This is a WRITE key (event ingest), not
// the personal API key used by /admin/metrics to READ (that stays
// POSTHOG_PERSONAL_API_KEY).
//
// Design notes:
// - Lazily construct the client so we don't crash the process at import
//   time if env vars are missing. Instead we log-and-noop.
// - `distinctId` is REQUIRED by PostHog. Server events usually don't
//   have a user, so we default to 'server' and let callers override
//   (e.g. with an admin email or advertiser id).
// - We fire-and-forget: capture() returns immediately, and shutdown()
//   is called from the process 'beforeExit' handler when available.
//   On Vercel, functions run per-request, so we also expose
//   flushServerEvents() for callers who want to await ingestion before
//   returning (e.g. right before NextResponse.json()).

import { PostHog } from 'posthog-node';

let client: PostHog | null = null;
let warnedMissingKey = false;

function getClient(): PostHog | null {
  if (client) return client;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
  if (!key) {
    if (!warnedMissingKey) {
      console.warn('[posthog-server] NEXT_PUBLIC_POSTHOG_KEY not set; server events disabled');
      warnedMissingKey = true;
    }
    return null;
  }
  client = new PostHog(key, {
    host,
    // Small batch/flush interval — Vercel functions are short-lived so
    // we want events out ASAP. Callers who need synchronous ingestion
    // should await flushServerEvents() before returning.
    flushAt: 1,
    flushInterval: 0,
  });
  return client;
}

/**
 * Fire a server-side event. Never throws — analytics failures must not
 * break the underlying request.
 *
 * @param event      Event name (matches EVENT_LABELS keys where possible).
 * @param distinctId Stable identifier for the actor. Use the admin email,
 *                   advertiser id, or 'server' for unattributed system events.
 * @param properties Arbitrary event properties (JSON-serializable).
 */
export function captureServerEvent(
  event: string,
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  try {
    const ph = getClient();
    if (!ph) return;
    ph.capture({
      distinctId,
      event,
      properties,
    });
  } catch (err) {
    // Analytics must never break the request. Log and swallow.
    console.error('[posthog-server] captureServerEvent failed', err);
  }
}

/**
 * Force-flush pending events. Useful before returning from a serverless
 * function when you need to guarantee ingestion. Safe to await; never
 * throws.
 */
export async function flushServerEvents(): Promise<void> {
  try {
    const ph = getClient();
    if (!ph) return;
    await ph.flush();
  } catch (err) {
    console.error('[posthog-server] flushServerEvents failed', err);
  }
}
