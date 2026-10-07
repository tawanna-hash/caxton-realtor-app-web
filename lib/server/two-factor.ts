import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { query } from '@/lib/server/db/neon';

const STEP = 30;
const DIGITS = 6;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

let schemaPromise: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;
  schemaPromise = query(`
    CREATE TABLE IF NOT EXISTS realtor_two_factor (
      realtor_id UUID PRIMARY KEY REFERENCES realtors(id) ON DELETE CASCADE,
      secret_enc TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      recovery_hashes TEXT[] NOT NULL DEFAULT '{}',
      last_step BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      enabled_at TIMESTAMPTZ
    )`).then(() => undefined).catch((e) => { schemaPromise = null; throw e; });
  return schemaPromise;
}

function key(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');
  return createHash('sha256').update(`two-factor:${secret}`).digest();
}
function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
function decrypt(blob: string): string {
  const [iv, tag, enc] = blob.split('.').map((p) => Buffer.from(p, 'base64'));
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

function b32encode(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function b32decode(s: string): Buffer {
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of s.replace(/=+$/, '').toUpperCase()) { const i = B32.indexOf(ch); if (i < 0) continue; value = (value << 5) | i; bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}

export function totpAt(secretB32: string, step: number): string {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', b32decode(secretB32)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** DIGITS).padStart(DIGITS, '0');
}

/** Returns the matching time step (within one step either side), or null. */
export function matchTotp(secretB32: string, code: string, nowMs = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const cur = Math.floor(nowMs / 1000 / STEP);
  for (const s of [cur, cur - 1, cur + 1]) {
    const expected = Buffer.from(totpAt(secretB32, s));
    if (timingSafeEqual(expected, Buffer.from(code))) return s;
  }
  return null;
}

const hashCode = (c: string) => createHash('sha256').update(c.replace(/[\s-]/g, '').toLowerCase()).digest('hex');

type Row = { secret_enc: string; enabled: boolean; recovery_hashes: string[]; last_step: string | number };
async function getRow(realtorId: string): Promise<Row | null> {
  await ensureSchema();
  const rows = await query<Row>(`SELECT secret_enc, enabled, recovery_hashes, last_step FROM realtor_two_factor WHERE realtor_id = $1`, [realtorId]);
  return rows[0] ?? null;
}

export async function isTwoFactorEnabled(realtorId: string): Promise<boolean> {
  return Boolean((await getRow(realtorId))?.enabled);
}

export async function beginSetup(realtorId: string, email: string): Promise<{ secret: string; otpauthUrl: string }> {
  await ensureSchema();
  const existing = await getRow(realtorId);
  if (existing?.enabled) throw new Error('Two-step sign-in is already on');
  const secret = b32encode(randomBytes(20));
  await query(
    `INSERT INTO realtor_two_factor (realtor_id, secret_enc, enabled) VALUES ($1,$2,FALSE)
     ON CONFLICT (realtor_id) DO UPDATE SET secret_enc = EXCLUDED.secret_enc, enabled = FALSE, recovery_hashes = '{}', last_step = 0`,
    [realtorId, encrypt(secret)],
  );
  const label = encodeURIComponent(`Closing Time:${email}`);
  return { secret, otpauthUrl: `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent('Closing Time')}&algorithm=SHA1&digits=6&period=30` };
}

export async function confirmSetup(realtorId: string, code: string): Promise<string[]> {
  const row = await getRow(realtorId);
  if (!row || row.enabled) throw new Error('Start setup first');
  const step = matchTotp(decrypt(row.secret_enc), code.trim());
  if (step === null) throw new Error('That code is not right. Check the time on your phone and try again.');
  const recovery = Array.from({ length: 8 }, () => { const r = randomBytes(5).toString('hex'); return `${r.slice(0, 5)}-${r.slice(5)}`; });
  await query(
    `UPDATE realtor_two_factor SET enabled = TRUE, enabled_at = NOW(), last_step = $2, recovery_hashes = $3 WHERE realtor_id = $1`,
    [realtorId, step, recovery.map(hashCode)],
  );
  return recovery;
}

/** Checks a 6-digit code or a one-time recovery code. Consumes it on success. */
export async function verifySignInCode(realtorId: string, input: string): Promise<boolean> {
  const row = await getRow(realtorId);
  if (!row?.enabled) return true;
  const code = input.trim();
  if (/^\d{6}$/.test(code)) {
    const step = matchTotp(decrypt(row.secret_enc), code);
    if (step === null || step <= Number(row.last_step)) return false; // wrong, or already used
    const upd = await query<{ realtor_id: string }>(
      `UPDATE realtor_two_factor SET last_step = $2 WHERE realtor_id = $1 AND last_step < $2 RETURNING realtor_id`, [realtorId, step]);
    return upd.length === 1;
  }
  const h = hashCode(code);
  if (!row.recovery_hashes.includes(h)) return false;
  const upd = await query<{ realtor_id: string }>(
    `UPDATE realtor_two_factor SET recovery_hashes = array_remove(recovery_hashes, $2) WHERE realtor_id = $1 AND $2 = ANY(recovery_hashes) RETURNING realtor_id`, [realtorId, h]);
  return upd.length === 1;
}

export async function disableTwoFactor(realtorId: string, code: string): Promise<void> {
  if (!(await verifySignInCode(realtorId, code))) throw new Error('That code is not right');
  await query(`DELETE FROM realtor_two_factor WHERE realtor_id = $1`, [realtorId]);
}
