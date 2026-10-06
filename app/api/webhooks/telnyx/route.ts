// app/api/webhooks/telnyx/route.ts
//
// Telnyx messaging webhook: inbound replies + delivery receipts.
// Telnyx Portal -> Messaging Profile -> Inbound/Status webhook URL:
//   https://realtynewsnow.app/api/webhooks/telnyx
// Env: TELNYX_PUBLIC_KEY (Portal -> Keys & Credentials -> Public Key, base64)
//
// Signature: Ed25519 over `${telnyx-timestamp}|${rawBody}`, base64 signature in
// `telnyx-signature-ed25519`. Timestamps older than 5 minutes are rejected.

import { NextRequest, NextResponse } from 'next/server';
import { createPublicKey, verify } from 'node:crypto';
import { exec } from '@/lib/server/db/neon';
import { logger } from '@/lib/server/logger';
import { attachInboundText, updateTextStatus } from '@/lib/server/closing-time-texts';
import { ensureSmsTables, START_WORDS, STOP_WORDS, toE164 } from '@/lib/server/sms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function verifySignature(raw: string, sig: string | null, ts: string | null): boolean {
  const pub = process.env.TELNYX_PUBLIC_KEY;
  if (!pub || !sig || !ts) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  try {
    const keyBytes = Buffer.from(pub, 'base64');
    if (keyBytes.length !== 32) return false;
    const key = createPublicKey({
      key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), keyBytes]),
      format: 'der',
      type: 'spki',
    });
    return verify(null, Buffer.from(`${ts}|${raw}`), key, Buffer.from(sig, 'base64'));
  } catch {
    return false;
  }
}

interface TelnyxEvent {
  data?: {
    event_type?: string;
    payload?: {
      id?: string;
      text?: string;
      from?: { phone_number?: string };
      to?: Array<{ phone_number?: string; status?: string }>;
      errors?: unknown[];
    };
  };
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get('telnyx-signature-ed25519'), req.headers.get('telnyx-timestamp'))) {
    return new NextResponse('invalid signature', { status: 400 });
  }
  let event: TelnyxEvent;
  try { event = JSON.parse(raw) as TelnyxEvent; } catch { return new NextResponse('bad json', { status: 400 }); }

  try {
    await ensureSmsTables();
    const type = event.data?.event_type;
    const p = event.data?.payload ?? {};

    if (type === 'message.received') {
      const phone = toE164(p.from?.phone_number);
      const text = String(p.text ?? '').trim();
      const word = text.toUpperCase().replace(/[^A-Z]/g, '');
      if (phone) {
        await exec(
          `INSERT INTO sms_messages (telnyx_id, direction, phone, body, status)
           VALUES ($1, 'inbound', $2, $3, 'received') ON CONFLICT (telnyx_id) DO NOTHING`,
          [p.id ?? null, phone, text]);
        await attachInboundText(phone, text, p.id ?? null);
        if (STOP_WORDS.has(word)) {
          // STOP applies to the number, so it covers every audience.
          const upd = await exec(
            `UPDATE sms_consent SET opt_out_at = NOW(), updated_at = NOW() WHERE phone = $1 AND opt_out_at IS NULL RETURNING id`,
            [phone]);
          if (upd.rowCount === 0) {
            await exec(
              `INSERT INTO sms_consent (phone, audience, opt_out_at) VALUES ($1, 'all', NOW()) ON CONFLICT (phone, audience) DO NOTHING`,
              [phone]);
          }
        } else if (START_WORDS.has(word)) {
          await exec(
            `UPDATE sms_consent SET opt_out_at = NULL, opt_in_at = NOW(), opt_in_source = 'reply-START', updated_at = NOW() WHERE phone = $1`,
            [phone]);
        }
      }
    } else if (type === 'message.sent' || type === 'message.finalized') {
      const status = p.to?.[0]?.status ?? (type === 'message.sent' ? 'sent' : 'unknown');
      const err = Array.isArray(p.errors) && p.errors.length ? JSON.stringify(p.errors) : null;
      await exec(
        `UPDATE sms_messages SET status = $2, error = $3, updated_at = NOW() WHERE telnyx_id = $1`,
        [p.id ?? null, status, err]);
      await updateTextStatus(p.id ?? null, status, err);
    }
  } catch (err) {
    // Still return 200 so Telnyx doesn't retry endlessly; the error is logged.
    logger.error({ err }, 'telnyx webhook processing failed');
  }
  return NextResponse.json({ ok: true });
}
