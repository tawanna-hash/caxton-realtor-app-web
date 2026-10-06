// lib/server/sms.ts
// Telnyx SMS: consent storage, opt-out aware sending, STOP/START handling.
// Env (Vercel): TELNYX_API_KEY, TELNYX_MESSAGING_PROFILE_ID, TELNYX_FROM_NUMBER, TELNYX_PUBLIC_KEY

import { exec, query } from '@/lib/server/db/neon';
import { logger } from '@/lib/server/logger';

export const STOP_WORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
export const START_WORDS = new Set(['START', 'YES', 'UNSTOP']);

let ensured = false;
export async function ensureSmsTables(): Promise<void> {
  if (ensured) return;
  await exec(`
    CREATE TABLE IF NOT EXISTS sms_consent (
      id            BIGSERIAL PRIMARY KEY,
      phone         TEXT NOT NULL,
      audience      TEXT NOT NULL,
      opt_in_at     TIMESTAMPTZ,
      opt_in_source TEXT,
      opt_out_at    TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (phone, audience)
    )`);
  await exec(`CREATE INDEX IF NOT EXISTS idx_sms_consent_phone ON sms_consent (phone)`);
  await exec(`
    CREATE TABLE IF NOT EXISTS sms_messages (
      id         BIGSERIAL PRIMARY KEY,
      telnyx_id  TEXT UNIQUE,
      direction  TEXT NOT NULL,
      phone      TEXT NOT NULL,
      audience   TEXT,
      body       TEXT,
      status     TEXT,
      error      TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await exec(`CREATE INDEX IF NOT EXISTS idx_sms_messages_phone ON sms_messages (phone)`);
  ensured = true;
}

/** US number -> E.164 (+1XXXXXXXXXX), or null. */
export function toE164(input: unknown): string | null {
  const d = String(input ?? '').replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return null;
}

export async function recordConsent(phone: string, audience: string, source: string): Promise<void> {
  await ensureSmsTables();
  await exec(
    `INSERT INTO sms_consent (phone, audience, opt_in_at, opt_in_source, opt_out_at)
     VALUES ($1, $2, NOW(), $3, NULL)
     ON CONFLICT (phone, audience)
     DO UPDATE SET opt_in_at = NOW(), opt_in_source = $3, opt_out_at = NULL, updated_at = NOW()`,
    [phone, audience, source],
  );
}

export type SendResult = {
  sent: Array<{ to: string; id: string | null }>;
  skipped: Array<{ to: string; reason: 'invalid_number' | 'no_consent' | 'opted_out' }>;
  failed: Array<{ to: string; error: string }>;
};

/** Text each number that opted in for `audience` and has not opted out of anything. */
export async function sendSms(audience: string, text: string, numbers: string[]): Promise<SendResult> {
  const key = process.env.TELNYX_API_KEY;
  const profile = process.env.TELNYX_MESSAGING_PROFILE_ID;
  const from = process.env.TELNYX_FROM_NUMBER;
  if (!key || !profile || !from) throw new Error('Telnyx environment variables are not set');
  await ensureSmsTables();

  const out: SendResult = { sent: [], skipped: [], failed: [] };
  for (const raw of numbers) {
    const phone = toE164(raw);
    if (!phone) { out.skipped.push({ to: String(raw), reason: 'invalid_number' }); continue; }

    const rows = await query<{ opt_in_at: string | null; opt_out_at: string | null }>(
      `SELECT opt_in_at, opt_out_at FROM sms_consent WHERE phone = $1 AND audience = $2`, [phone, audience]);
    const anyOut = await query(`SELECT 1 FROM sms_consent WHERE phone = $1 AND opt_out_at IS NOT NULL LIMIT 1`, [phone]);
    const c = rows[0];
    if (!c || !c.opt_in_at) { out.skipped.push({ to: phone, reason: 'no_consent' }); continue; }
    if (c.opt_out_at || anyOut.length > 0) { out.skipped.push({ to: phone, reason: 'opted_out' }); continue; }

    try {
      const resp = await fetch('https://api.telnyx.com/v2/messages', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: phone, text, messaging_profile_id: profile, type: 'SMS' }),
      });
      const data = (await resp.json()) as { data?: { id?: string }; errors?: unknown };
      if (!resp.ok) {
        const err = JSON.stringify(data.errors ?? data);
        out.failed.push({ to: phone, error: err });
        await exec(
          `INSERT INTO sms_messages (direction, phone, audience, body, status, error) VALUES ('outbound', $1, $2, $3, 'failed', $4)`,
          [phone, audience, text, err]);
        continue;
      }
      const id = data.data?.id ?? null;
      await exec(
        `INSERT INTO sms_messages (telnyx_id, direction, phone, audience, body, status)
         VALUES ($1, 'outbound', $2, $3, $4, 'queued') ON CONFLICT (telnyx_id) DO NOTHING`,
        [id, phone, audience, text]);
      out.sent.push({ to: phone, id });
    } catch (err) {
      logger.error({ err }, 'telnyx send failed');
      out.failed.push({ to: phone, error: String(err) });
    }
  }
  return out;
}

/**
 * One opt-in request text. It does not need prior consent, but never goes to a number that opted out.
 * It creates a pending consent row, so a YES reply (handled by the webhook) records the opt-in.
 */
export async function sendOptInRequest(audience: string, text: string, rawNumber: string): Promise<{ ok: boolean; id?: string | null; error?: string }> {
  const key = process.env.TELNYX_API_KEY;
  const profile = process.env.TELNYX_MESSAGING_PROFILE_ID;
  const from = process.env.TELNYX_FROM_NUMBER;
  if (!key || !profile || !from) return { ok: false, error: 'Telnyx environment variables are not set' };
  const phone = toE164(rawNumber);
  if (!phone) return { ok: false, error: 'Invalid phone number' };
  await ensureSmsTables();
  const out = await query(`SELECT 1 FROM sms_consent WHERE phone = $1 AND opt_out_at IS NOT NULL LIMIT 1`, [phone]);
  if (out.length > 0) return { ok: false, error: 'This number opted out of texts' };
  await exec(`INSERT INTO sms_consent (phone, audience) VALUES ($1, $2) ON CONFLICT (phone, audience) DO NOTHING`, [phone, audience]);
  try {
    const resp = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: phone, text, messaging_profile_id: profile, type: 'SMS' }),
    });
    const data = (await resp.json()) as { data?: { id?: string }; errors?: unknown };
    if (!resp.ok) return { ok: false, error: JSON.stringify(data.errors ?? data) };
    const id = data.data?.id ?? null;
    await exec(`INSERT INTO sms_messages (telnyx_id, direction, phone, audience, body, status) VALUES ($1, 'outbound', $2, $3, $4, 'queued') ON CONFLICT (telnyx_id) DO NOTHING`, [id, phone, audience, text]);
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export type ConsentState = 'opted_in' | 'pending' | 'opted_out' | 'none';
export async function consentState(audience: string, rawNumber: string): Promise<ConsentState> {
  const phone = toE164(rawNumber);
  if (!phone) return 'none';
  await ensureSmsTables();
  const any = await query(`SELECT 1 FROM sms_consent WHERE phone = $1 AND opt_out_at IS NOT NULL LIMIT 1`, [phone]);
  if (any.length > 0) return 'opted_out';
  const rows = await query<{ opt_in_at: string | null }>(`SELECT opt_in_at FROM sms_consent WHERE phone = $1 AND audience = $2`, [phone, audience]);
  if (!rows[0]) return 'none';
  return rows[0].opt_in_at ? 'opted_in' : 'pending';
}
