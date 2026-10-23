// Signed, purpose-scoped token for the client Payment Method Setup page.
// Format: <subject>.<expiresUnix>.<hmac>, where subject is `c<advertiserId>`
// for a client or a bare agreement id (links created before client links).
// HMAC-SHA256 over "pm_setup:<subject>.<expiresUnix>" with SIGN_SECRET, so a setup link
// can't be reused as an agreement-signing token (and vice versa).
import crypto from 'node:crypto';

const DEFAULT_TTL_DAYS = 14;

function secret(): string {
  const s = process.env.SIGN_SECRET;
  if (!s) throw new Error('SIGN_SECRET is not configured');
  return s;
}

function mac(body: string): string {
  return crypto.createHmac('sha256', secret()).update(`pm_setup:${body}`).digest('base64url');
}

export type PaymentSetupSubject = { kind: 'client'; id: number } | { kind: 'agreement'; id: string };

export function signPaymentSetupToken(subject: PaymentSetupSubject, ttlDays = DEFAULT_TTL_DAYS): { token: string; expiresAt: Date } {
  const exp = Math.floor(Date.now() / 1000) + ttlDays * 86400;
  const body = `${subject.kind === 'client' ? `c${subject.id}` : subject.id}.${exp}`;
  return { token: `${body}.${mac(body)}`, expiresAt: new Date(exp * 1000) };
}

export type PaymentSetupTokenResult = { ok: true; subject: PaymentSetupSubject } | { ok: false; reason: 'invalid' | 'expired' };

export function verifyPaymentSetupToken(token: string): PaymentSetupTokenResult {
  const parts = (token ?? '').split('.');
  if (parts.length !== 3) return { ok: false, reason: 'invalid' };
  const [id, expStr, sig] = parts;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || !/^\d{9,11}$/.test(expStr)) return { ok: false, reason: 'invalid' };
  const expected = mac(`${id}.${expStr}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'invalid' };
  if (Number(expStr) * 1000 < Date.now()) return { ok: false, reason: 'expired' };
  const client = /^c(\d{1,12})$/.exec(id);
  return { ok: true, subject: client ? { kind: 'client', id: Number(client[1]) } : { kind: 'agreement', id } };
}

export function paymentSetupUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtynewsnow.app').replace(/\/+$/, '');
  return `${base}/pay/setup/${token}`;
}
