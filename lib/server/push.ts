// lib/server/push.ts
//
// Server-side web-push helpers. Wraps the `web-push` library with our DB-
// backed subscription store so admin notification sends can fan out to
// every subscribed browser, with automatic cleanup of dead endpoints
// (HTTP 404/410 from the push service means the user unsubscribed).

import webpush from 'web-push';
import { getSql } from '@/lib/db';

let vapidConfigured = false;

function ensureVapid(): void {
  if (vapidConfigured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const contact = process.env.VAPID_CONTACT || 'mailto:admin@realtynewsnow.app';
  if (!publicKey || !privateKey) {
    throw new Error(
      '[push] VAPID keys missing. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in env.',
    );
  }
  webpush.setVapidDetails(contact, publicKey, privateKey);
  vapidConfigured = true;
}

export type PushSubscriptionRow = {
  id: string;
  realtor_id: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  market: string | null;
};

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
  image?: string;
  tag?: string;
  notificationId?: string;
};

/**
 * Send a single push notification. Returns true on success, false on
 * permanent failure (404/410 — endpoint dead). Throws on other errors so
 * the caller can decide whether to retry.
 */
export async function sendPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
): Promise<{ ok: boolean; gone: boolean; error?: string }> {
  ensureVapid();
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24 }, // 24h — message is dropped if the device is offline longer
    );
    return { ok: true, gone: false };
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      return { ok: false, gone: true, error: `endpoint ${status}` };
    }
    return { ok: false, gone: false, error: (err as Error).message };
  }
}

/**
 * Mark a push subscription as revoked after a 404/410 from the push service.
 * Keeps the row for audit trail rather than deleting outright.
 */
export async function markSubscriptionGone(endpoint: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE push_subscriptions
       SET revoked_at = NOW()
     WHERE endpoint = ${endpoint}
       AND revoked_at IS NULL
  `;
}

export type PushMarketFilter = 'austin' | 'san_antonio' | 'houston' | 'dallas';

/**
 * Fan out a payload to every active subscription matching the audience
 * filter. Returns counts for the admin UI.
 *
 * `marketFilter`:
 *   - undefined → send to everyone (no filter)
 *   - 'austin' / 'san_antonio' / 'houston' / 'dallas' → filter push_subscriptions.market
 *
 * For each subscription we also record a row in `notification_deliveries`
 * so the admin can see per-realtor delivery status. Anonymous subscriptions
 * (realtor_id NULL) are still sent to but skip the delivery row.
 */
export async function broadcastPush(
  notificationId: string,
  payload: PushPayload,
  marketFilter?: PushMarketFilter,
): Promise<{ sent: number; failed: number; revoked: number }> {
  const sql = getSql();

  const subs = (marketFilter
    ? await sql`
        SELECT id, realtor_id, endpoint, p256dh, auth, market
          FROM push_subscriptions
         WHERE revoked_at IS NULL
           AND market = ${marketFilter}
      `
    : await sql`
        SELECT id, realtor_id, endpoint, p256dh, auth, market
          FROM push_subscriptions
         WHERE revoked_at IS NULL
      `) as unknown as PushSubscriptionRow[];

  let sent = 0;
  let failed = 0;
  let revoked = 0;

  console.log('[broadcastPush] start', {
    notificationId,
    marketFilter: marketFilter || 'all',
    subscriberCount: subs.length,
    title: payload.title,
  });

  // Process in chunks to bound concurrency. A single chunk opens at most
  // CHUNK_SIZE concurrent HTTPS connections to the push service and writes
  // one batched INSERT per chunk to notification_deliveries.
  const CHUNK_SIZE = 25;
  type DeliveryRow = { realtor_id: string; delivered_at: string | null; failure_reason: string | null };

  for (let i = 0; i < subs.length; i += CHUNK_SIZE) {
    const chunk = subs.slice(i, i + CHUNK_SIZE);
    const deliveries: DeliveryRow[] = [];
    const goneEndpoints: string[] = [];

    const results = await Promise.all(
      chunk.map((sub) => sendPush(sub, { ...payload, notificationId })),
    );

    for (let j = 0; j < chunk.length; j++) {
      const sub = chunk[j];
      const result = results[j];
      if (result.ok) {
        sent += 1;
        if (sub.realtor_id) {
          deliveries.push({ realtor_id: sub.realtor_id, delivered_at: new Date().toISOString(), failure_reason: null });
        }
      } else if (result.gone) {
        revoked += 1;
        goneEndpoints.push(sub.endpoint);
        if (sub.realtor_id) {
          deliveries.push({ realtor_id: sub.realtor_id, delivered_at: null, failure_reason: result.error ?? 'gone' });
        }
      } else {
        failed += 1;
        if (sub.realtor_id) {
          deliveries.push({ realtor_id: sub.realtor_id, delivered_at: null, failure_reason: result.error ?? 'unknown' });
        }
      }
    }

    // Batched delivery insert: one INSERT per chunk instead of one per sub.
    if (deliveries.length > 0) {
      try {
        const realtorIds = deliveries.map((d) => d.realtor_id);
        const deliveredAts = deliveries.map((d) => d.delivered_at);
        const failureReasons = deliveries.map((d) => d.failure_reason);
        await sql`
          INSERT INTO notification_deliveries
            (notification_id, realtor_id, channel, delivered_at, failure_reason)
          SELECT
            ${notificationId}::uuid,
            r::uuid,
            'web_push',
            d,
            f
          FROM UNNEST(
            ${realtorIds}::uuid[],
            ${deliveredAts}::timestamptz[],
            ${failureReasons}::text[]
          ) AS t(r, d, f)
        `;
      } catch (err) {
        // Non-fatal — pushes still went out, just no audit rows for this chunk.
        console.warn('[broadcastPush] batched delivery insert failed:', err);
      }
    }

    // Revoke dead endpoints in one statement per chunk.
    if (goneEndpoints.length > 0) {
      try {
        await sql`
          UPDATE push_subscriptions
             SET revoked_at = NOW()
           WHERE endpoint = ANY(${goneEndpoints})
             AND revoked_at IS NULL
        `;
      } catch (err) {
        console.warn('[broadcastPush] mark-gone batch failed:', err);
      }
    }
  }

  console.log('[broadcastPush] done', { notificationId, sent, failed, revoked });
  return { sent, failed, revoked };
}
