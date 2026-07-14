// app/api/webhooks/resend/route.ts
//
// Resend webhook endpoint. Receives delivery / bounce / complaint events
// from Resend (signed via Svix) and updates the corresponding email_log
// row by provider_message_id.
//
// Resend Dashboard -> Webhooks -> Add endpoint:
//   URL:    https://realtynewsnow.app/api/webhooks/resend
//   Events: email.delivered, email.bounced, email.complained
// Then copy the signing secret (starts with `whsec_`) into Vercel env as
//   RESEND_WEBHOOK_SECRET
//
// Signature scheme (Svix):
//   - Headers: svix-id, svix-timestamp, svix-signature
//   - svix-signature is a space-separated list of "v1,<base64-hmac>" pairs
//   - HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${rawBody}` using the
//     decoded secret bytes (the part of `whsec_...` after the prefix,
//     base64-decoded). We compare in constant time.
//
// We tolerate timestamps within +/- 5 minutes of now (Svix default).

import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { exec } from '@/lib/server/db/neon';
import { logger } from '@/lib/server/logger';
import { handleBounceAlert } from '@/lib/server/bounce-alert';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Svix tolerance window in seconds. Mirrors the Svix SDK default.
const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

interface ResendWebhookEvent {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    from?: string;
    subject?: string;
    bounce?: {
      type?: string;
      subType?: string;
      message?: string;
    };
    // Resend sometimes nests bounce info differently across providers;
    // we read defensively below.
    [key: string]: unknown;
  };
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    logger.error({}, '[resend-webhook] RESEND_WEBHOOK_SECRET not configured');
    return NextResponse.json(
      { error: 'RESEND_WEBHOOK_SECRET not configured' },
      { status: 503 },
    );
  }

  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: 'missing svix signature headers' },
      { status: 400 },
    );
  }

  // Reject stale or future-dated payloads.
  const tsNum = Number(svixTimestamp);
  if (!Number.isFinite(tsNum)) {
    return NextResponse.json({ error: 'invalid svix-timestamp' }, { status: 400 });
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsNum) > TIMESTAMP_TOLERANCE_SECONDS) {
    logger.warn(
      { svixId, svixTimestamp, drift: nowSec - tsNum },
      '[resend-webhook] timestamp outside tolerance',
    );
    return NextResponse.json({ error: 'timestamp out of tolerance' }, { status: 400 });
  }

  const rawBody = await req.text();

  if (!verifySvixSignature(secret, svixId, svixTimestamp, svixSignature, rawBody)) {
    logger.warn({ svixId }, '[resend-webhook] signature verification failed');
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(rawBody) as ResendWebhookEvent;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'invalid json';
    logger.warn({ err: msg }, '[resend-webhook] body is not valid JSON');
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 });
  }

  const emailId = event.data?.email_id;
  if (!emailId) {
    // Still return 200 so Resend doesn't retry; just log so we notice.
    logger.warn(
      { svixId, eventType: event.type },
      '[resend-webhook] event missing data.email_id',
    );
    return NextResponse.json({ received: true, ignored: 'no_email_id' });
  }

  try {
    switch (event.type) {
      case 'email.delivered': {
        const result = await exec(
          `UPDATE email_log
              SET delivered_at = NOW()
            WHERE provider_message_id = $1
              AND delivered_at IS NULL`,
          [emailId],
        );
        logger.info(
          { emailId, rows: result.rowCount, svixId, eventType: event.type },
          '[resend-webhook] email.delivered processed',
        );
        break;
      }

      case 'email.bounced': {
        const bounceType = extractBounceType(event);
        const result = await exec(
          `UPDATE email_log
              SET bounced_at = NOW(),
                  bounce_type = $2
            WHERE provider_message_id = $1
              AND bounced_at IS NULL`,
          [emailId, bounceType],
        );
        logger.warn(
          {
            emailId,
            bounceType,
            rows: result.rowCount,
            svixId,
            eventType: event.type,
          },
          '[resend-webhook] email.bounced processed',
        );
        // Roll up to advertiser + fire admin alert (best-effort, never throws)
        await handleBounceAlert({ emailId, bounceType }).catch((err) => {
          logger.error(
            { err: err instanceof Error ? err.message : 'unknown', emailId },
            '[resend-webhook] bounce-alert handler failed',
          );
        });
        break;
      }

      case 'email.complained': {
        const result = await exec(
          `UPDATE email_log
              SET complained_at = NOW()
            WHERE provider_message_id = $1
              AND complained_at IS NULL`,
          [emailId],
        );
        logger.warn(
          { emailId, rows: result.rowCount, svixId, eventType: event.type },
          '[resend-webhook] email.complained processed',
        );
        break;
      }

      default: {
        // Other event types (email.sent, email.opened, email.clicked, etc.)
        // are accepted and logged but not persisted. Return 2xx so Resend
        // doesn't retry.
        logger.info(
          { eventType: event.type, emailId, svixId },
          '[resend-webhook] ignored event type',
        );
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    logger.error(
      { err: msg, eventType: event.type, emailId, svixId },
      '[resend-webhook] handler error',
    );
    // 500 so Resend retries on transient DB errors.
    return NextResponse.json({ error: 'handler failed', detail: msg }, { status: 500 });
  }
}

/**
 * Verify a Svix-signed payload using stdlib HMAC-SHA256.
 *
 * Svix secrets are formatted as `whsec_<base64>` — we strip the prefix
 * and base64-decode the rest to get the raw HMAC key bytes.
 *
 * `svix-signature` is a space-separated list of `v1,<base64-signature>`
 * pairs (Svix may rotate signatures). We accept the request if ANY of
 * the provided v1 signatures match.
 */
export function verifySvixSignature(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  rawBody: string,
): boolean {
  const keyBytes = decodeWhsec(secret);
  if (!keyBytes) return false;

  const signedPayload = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = createHmac('sha256', keyBytes).update(signedPayload).digest();

  // svix-signature header: "v1,<sig> v1,<sig2> v2,<unused>"
  const candidates = svixSignature.split(' ');
  for (const candidate of candidates) {
    const [version, sigB64] = candidate.split(',');
    if (version !== 'v1' || !sigB64) continue;
    let actual: Buffer;
    try {
      actual = Buffer.from(sigB64, 'base64');
    } catch {
      continue;
    }
    if (actual.length !== expected.length) continue;
    if (timingSafeEqual(actual, expected)) return true;
  }

  return false;
}

function decodeWhsec(secret: string): Buffer | null {
  // Resend/Svix secrets look like `whsec_xxx...`. The portion after the
  // underscore is base64-encoded random bytes used as the HMAC key.
  const trimmed = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  try {
    const buf = Buffer.from(trimmed, 'base64');
    if (buf.length === 0) return null;
    return buf;
  } catch {
    return null;
  }
}

function extractBounceType(event: ResendWebhookEvent): string | null {
  const data = event.data;
  if (!data) return null;
  const bounce = data.bounce as Record<string, unknown> | undefined;
  if (bounce && typeof bounce === 'object') {
    const t = bounce.type;
    if (typeof t === 'string' && t.length > 0) return t.slice(0, 64);
    const sub = bounce.subType;
    if (typeof sub === 'string' && sub.length > 0) return sub.slice(0, 64);
  }
  // Some webhook payloads put a flat string at `data.bounce_type`.
  const flat = (data as Record<string, unknown>).bounce_type;
  if (typeof flat === 'string' && flat.length > 0) return flat.slice(0, 64);
  return null;
}
