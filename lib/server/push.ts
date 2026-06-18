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

/**
 * Fan out a payload to every active subscription matching the audience
 * filter. Returns counts for the admin UI.
 *
 * `marketFilter`:
 *   - undefined → send to everyone (no filter)
 *   - 'austin' / 'san_antonio' → filter push_subscriptions.market
 *
 * For each subscription we also record a row in `notification_deliveries`
 * so the admin can see per-realtor delivery status. Anonymous subscriptions
 * (realtor_id NULL) are still sent to but skip the delivery row.
 */
export async function broadcastPush(
  notificationId: string,
  payload: PushPayload,
  marketFilter?: 'austin' | 'san_antonio',
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

  await Promise.all(
    subs.map(async (sub) => {
      const result = await sendPush(sub, { ...payload, notificationId });
      if (result.ok) {
        sent += 1;
        if (sub.realtor_id) {
          try {
            await sql`
              INSERT INTO notification_deliveries (notification_id, realtor_id, channel, delivered_at)
              VALUES (${notificationId}::uuid, ${sub.realtor_id}::uuid, 'web_push', NOW())
            `;
          } catch (err) {
            // Non-fatal — delivery still happened, just no audit row.
            console.warn('[broadcastPush] delivery insert failed:', err);
          }
        }
      } else if (result.gone) {
        revoked += 1;
        await markSubscriptionGone(sub.endpoint);
        if (sub.realtor_id) {
          try {
            await sql`
              INSERT INTO notification_deliveries (notification_id, realtor_id, channel, failure_reason)
              VALUES (${notificationId}::uuid, ${sub.realtor_id}::uuid, 'web_push', ${result.error ?? 'gone'})
            `;
          } catch (err) {
            // ignore
          }
        }
      } else {
        failed += 1;
        if (sub.realtor_id) {
          try {
            await sql`
              INSERT INTO notification_deliveries (notification_id, realtor_id, channel, failure_reason)
              VALUES (${notificationId}::uuid, ${sub.realtor_id}::uuid, 'web_push', ${result.error ?? 'unknown'})
            `;
          } catch (err) {
            // ignore
          }
        }
      }
    }),
  );

  return { sent, failed, revoked };
}
