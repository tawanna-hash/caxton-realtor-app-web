// lib/server/android-push.ts
//
// Firebase Cloud Messaging (HTTP v1) sender for the Android app.
// Needs FCM_SERVICE_ACCOUNT_JSON (the Firebase service-account JSON) in the
// production env. Returns skipped=true when it isn't configured.

import { GoogleAuth } from 'google-auth-library';
import { getSql } from '@/lib/db';
import type { PushPayload } from '@/lib/server/push';

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

let cachedAuth: { auth: GoogleAuth; projectId: string } | null | undefined;

function getFcm(): { auth: GoogleAuth; projectId: string } | null {
  if (cachedAuth !== undefined) return cachedAuth;
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) return (cachedAuth = null);
  try {
    const creds = JSON.parse(raw) as ServiceAccount;
    creds.private_key = creds.private_key.replace(/\\n/g, '\n');
    cachedAuth = {
      auth: new GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/firebase.messaging'] }),
      projectId: creds.project_id,
    };
  } catch (error) {
    console.error('[android-push] invalid FCM_SERVICE_ACCOUNT_JSON', error);
    cachedAuth = null;
  }
  return cachedAuth;
}

export function isFcmConfigured(): boolean {
  return getFcm() !== null;
}

export async function sendAndroidPush(
  token: string,
  payload: PushPayload,
): Promise<{ ok: boolean; gone: boolean; error?: string }> {
  const fcm = getFcm();
  if (!fcm) return { ok: false, gone: false, error: 'fcm-not-configured' };
  const accessToken = await fcm.auth.getAccessToken();
  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries({ url: payload.url, tag: payload.tag, notificationId: payload.notificationId })) {
    if (typeof value === 'string' && value) data[key] = value;
  }
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${fcm.projectId}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: payload.title, body: payload.body },
        data,
        android: { priority: 'high', notification: { tag: payload.tag, sound: 'default' } },
      },
    }),
  });
  if (res.ok) return { ok: true, gone: false };
  const text = await res.text().catch(() => '');
  const gone = res.status === 404 || /UNREGISTERED|registration-token-not-registered/i.test(text);
  return { ok: false, gone, error: `fcm ${res.status}: ${text.slice(0, 200)}` };
}

/** Send to every active Android app token for one realtor. */
export async function sendAndroidPushToRealtor(
  realtorId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number; revoked: number; skipped: boolean }> {
  if (!isFcmConfigured()) return { sent: 0, failed: 0, revoked: 0, skipped: true };
  const sql = getSql();
  const tokens = (await sql`
    SELECT token FROM native_push_tokens
     WHERE realtor_id = ${realtorId}::uuid
       AND revoked_at IS NULL
       AND platform = 'android'
  `) as unknown as { token: string }[];
  let sent = 0;
  let failed = 0;
  let revoked = 0;
  for (const row of tokens) {
    const res = await sendAndroidPush(row.token, payload);
    if (res.ok) sent += 1;
    else if (res.gone) {
      revoked += 1;
      await sql`UPDATE native_push_tokens SET revoked_at = NOW() WHERE token = ${row.token} AND revoked_at IS NULL`;
    } else failed += 1;
  }
  return { sent, failed, revoked, skipped: false };
}
