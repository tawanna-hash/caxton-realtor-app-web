// lib/server/native-push.ts
//
// Server-side APNs sender. Mirrors lib/server/push.ts (the web-push fan-out)
// but talks to Apple's HTTP/2 push gateway using token-based authentication
// (.p8 key + Key ID + Team ID). Falls back to a no-op shape when the
// env vars aren't configured, so the rest of the app keeps working in
// environments where native push hasn't been provisioned yet.
//
// What this file handles for you:
//   - Lazy client initialization from env (cached as a module singleton)
//   - Single-token send with structured pass/fail result
//   - Fan-out across the native_push_tokens table with bounded concurrency
//   - Revocation cleanup on APNs BadDeviceToken / Unregistered responses
//   - Delivery audit rows in notification_deliveries (channel='ios_push')
//
// What you do separately:
//   - Generate the APNs Auth Key (.p8) in developer.apple.com → Keys → +
//   - Set APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, APNS_PRIVATE_KEY_P8
//     in production env (Vercel project settings). The .p8 contents can be
//     stored either as the raw PEM string with literal newlines, or with
//     \n escapes — we normalize both.

import { ApnsClient, Notification, Priority, Errors } from 'apns2';
import { getSql } from '@/lib/db';
import type { PushPayload } from '@/lib/server/push';

type NativeRow = {
  id: string;
  realtor_id: string | null;
  token: string;
  platform: 'ios' | 'android';
  market: string | null;
};

let cachedClient: ApnsClient | null | undefined;
let lastClientError: string | null = null;

/** True when APNS_* env vars are all set and the client constructed cleanly. */
function isApnsConfigured(): boolean {
  return getApnsClient() !== null;
}

/** Human-readable diagnosis for the admin UI when isApnsConfigured() is false. */
export function getApnsConfigStatus(): {
  configured: boolean;
  reason: string | null;
  hasKeyId: boolean;
  hasTeamId: boolean;
  hasBundleId: boolean;
  hasKey: boolean;
} {
  const hasKeyId = !!process.env.APNS_KEY_ID;
  const hasTeamId = !!process.env.APNS_TEAM_ID;
  const hasBundleId = !!process.env.APNS_BUNDLE_ID;
  const hasKey = !!process.env.APNS_PRIVATE_KEY_P8;
  const configured = isApnsConfigured();
  let reason: string | null = null;
  if (!configured) {
    if (!hasKeyId || !hasTeamId || !hasBundleId || !hasKey) {
      reason = 'env-missing';
    } else if (lastClientError) {
      reason = lastClientError;
    } else {
      reason = 'unknown';
    }
  }
  return { configured, reason, hasKeyId, hasTeamId, hasBundleId, hasKey };
}

/**
 * Return a shared ApnsClient or null if env vars are missing.
 * Null is the signal to upstream code that native push isn't provisioned
 * yet — callers should treat it as "no native subscribers to fan out to".
 */
function getApnsClient(): ApnsClient | null {
  if (cachedClient !== undefined) return cachedClient;

  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const bundleId = process.env.APNS_BUNDLE_ID;
  let signingKey = process.env.APNS_PRIVATE_KEY_P8;

  if (!keyId || !teamId || !bundleId || !signingKey) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        '[native-push] APNS_* env vars not fully set — native push disabled.',
        { hasKeyId: !!keyId, hasTeamId: !!teamId, hasBundleId: !!bundleId, hasKey: !!signingKey },
      );
    }
    cachedClient = null;
    return null;
  }

  // Normalize escaped newlines so the secret can be stored either way.
  if (signingKey.includes('\\n')) signingKey = signingKey.replace(/\\n/g, '\n');

  try {
    cachedClient = new ApnsClient({
      team: teamId,
      keyId,
      signingKey,
      defaultTopic: bundleId,
      // The library defaults to production. aps-environment=production in
      // App.entitlements + production gateway here is the right pairing
      // for TestFlight + App Store builds.
    });
    lastClientError = null;
    return cachedClient;
  } catch (err) {
    console.error('[native-push] failed to construct APNs client:', err);
    lastClientError = (err as Error).message || 'construct-failed';
    cachedClient = null;
    return null;
  }
}

export type NativeSendResult = {
  ok: boolean;
  /** True if APNs told us the token is permanently invalid (BadDeviceToken / Unregistered). */
  gone: boolean;
  error?: string;
};

/** Send a single APNs push. Returns gone=true on a token that should be revoked. */
export async function sendNativePush(
  token: string,
  payload: PushPayload,
): Promise<NativeSendResult> {
  const client = getApnsClient();
  if (!client) return { ok: false, gone: false, error: 'apns-not-configured' };

  // Build the notification. Title + body go in the standard alert dictionary;
  // the rest of the PushPayload rides as custom data so the iOS app can route
  // the user to the right URL on tap.
  const notification = new Notification(token, {
    alert: { title: payload.title, body: payload.body },
    sound: 'default',
    badge: undefined,
    priority: Priority.immediate,
    // Custom keys land alongside `aps` in the JSON envelope.
    data: {
      url: payload.url,
      icon: payload.icon,
      badge: payload.badge,
      image: payload.image,
      tag: payload.tag,
      notificationId: payload.notificationId,
    },
  });

  try {
    await client.send(notification);
    return { ok: true, gone: false };
  } catch (err) {
    const reason = (err as { reason?: string }).reason;
    // Apple-defined reasons that mean "stop sending to this token forever":
    //   BadDeviceToken — token is malformed or for the wrong environment
    //   Unregistered — user uninstalled the app or disabled notifications
    //   DeviceTokenNotForTopic — token doesn't match our bundle id
    if (
      reason === Errors.badDeviceToken ||
      reason === Errors.unregistered ||
      reason === Errors.deviceTokenNotForTopic
    ) {
      return { ok: false, gone: true, error: reason };
    }
    return { ok: false, gone: false, error: reason || (err as Error).message };
  }
}

/** Mark a native token revoked after a permanent APNs failure. */
export async function markNativeTokenGone(token: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE native_push_tokens
       SET revoked_at = NOW()
     WHERE token = ${token}
       AND revoked_at IS NULL
  `;
}

import type { PushMarketFilter } from '@/lib/server/push';
export type { PushMarketFilter };

/**
 * Fan out to every active iOS device token. Mirrors broadcastPush() so the
 * caller can run web + native in parallel with the same chunking + audit
 * semantics. When APNs isn't configured, returns zeros without throwing
 * so the web-push path still completes.
 */
export async function broadcastNativePush(
  notificationId: string,
  payload: PushPayload,
  marketFilter?: PushMarketFilter,
): Promise<{ sent: number; failed: number; revoked: number; skipped: boolean }> {
  const client = getApnsClient();
  if (!client) return { sent: 0, failed: 0, revoked: 0, skipped: true };

  const sql = getSql();
  const tokens = (marketFilter
    ? await sql`
        SELECT id, realtor_id, token, platform, market
          FROM native_push_tokens
         WHERE revoked_at IS NULL
           AND platform = 'ios'
           AND market = ${marketFilter}
      `
    : await sql`
        SELECT id, realtor_id, token, platform, market
          FROM native_push_tokens
         WHERE revoked_at IS NULL
           AND platform = 'ios'
      `) as unknown as NativeRow[];

  let sent = 0;
  let failed = 0;
  let revoked = 0;

  console.log('[broadcastNativePush] start', {
    notificationId,
    marketFilter: marketFilter || 'all',
    tokenCount: tokens.length,
    title: payload.title,
  });

  // APNs over HTTP/2 multiplexes well — 25 in-flight is comfortable for
  // a single connection and mirrors the web-push concurrency.
  const CHUNK = 25;
  type DeliveryRow = { realtor_id: string; delivered_at: string | null; failure_reason: string | null };

  for (let i = 0; i < tokens.length; i += CHUNK) {
    const chunk = tokens.slice(i, i + CHUNK);
    const deliveries: DeliveryRow[] = [];
    const goneTokens: string[] = [];

    const results = await Promise.all(
      chunk.map((row) => sendNativePush(row.token, { ...payload, notificationId })),
    );

    for (let j = 0; j < chunk.length; j++) {
      const row = chunk[j];
      const res = results[j];
      if (res.ok) {
        sent += 1;
        if (row.realtor_id) {
          deliveries.push({
            realtor_id: row.realtor_id,
            delivered_at: new Date().toISOString(),
            failure_reason: null,
          });
        }
      } else if (res.gone) {
        revoked += 1;
        goneTokens.push(row.token);
        if (row.realtor_id) {
          deliveries.push({
            realtor_id: row.realtor_id,
            delivered_at: null,
            failure_reason: res.error ?? 'gone',
          });
        }
      } else {
        failed += 1;
        if (row.realtor_id) {
          deliveries.push({
            realtor_id: row.realtor_id,
            delivered_at: null,
            failure_reason: res.error ?? 'unknown',
          });
        }
      }
    }

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
            'ios_push',
            d,
            f
          FROM UNNEST(
            ${realtorIds}::uuid[],
            ${deliveredAts}::timestamptz[],
            ${failureReasons}::text[]
          ) AS t(r, d, f)
        `;
      } catch (err) {
        console.warn('[broadcastNativePush] batched delivery insert failed:', err);
      }
    }

    if (goneTokens.length > 0) {
      try {
        await sql`
          UPDATE native_push_tokens
             SET revoked_at = NOW()
           WHERE token = ANY(${goneTokens})
             AND revoked_at IS NULL
        `;
      } catch (err) {
        console.warn('[broadcastNativePush] mark-gone batch failed:', err);
      }
    }
  }

  console.log('[broadcastNativePush] done', { notificationId, sent, failed, revoked });
  return { sent, failed, revoked, skipped: false };
}
