// Stable, signed "pay" links for emailed statements.
//
// Stripe Checkout URLs die after ~24h, so statements email these app URLs
// instead. When the client opens one and confirms, a fresh Checkout Session is
// created on the spot and they are sent to Stripe.
import crypto from 'node:crypto';

const TTL_DAYS = 36500; // ~100 years; links never expire

function secret(): string {
  const s = process.env.SIGN_SECRET;
  if (!s) throw new Error('SIGN_SECRET is not configured');
  return s;
}
function mac(body: string): string {
  return crypto.createHmac('sha256', secret()).update(`stmt_pay:${body}`).digest('base64url');
}

export type StatementPaySubject =
  | { kind: 'invoice'; invoiceId: string }
  | { kind: 'statement'; advertiserId: number; scope: 'overdue' | 'all' };

function subjectId(s: StatementPaySubject): string {
  return s.kind === 'invoice' ? `i_${s.invoiceId}` : `s_${s.advertiserId}_${s.scope}`;
}

export function statementPayUrl(subject: StatementPaySubject): string {
  const exp = Math.floor(Date.now() / 1000) + TTL_DAYS * 86400;
  const body = `${subjectId(subject)}.${exp}`;
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtynewsnow.app').replace(/\/+$/, '');
  return `${base}/pay/statement/${body}.${mac(body)}`;
}

export function verifyStatementPayToken(token: string): { ok: true; subject: StatementPaySubject } | { ok: false; reason: 'invalid' | 'expired' } {
  const parts = (token ?? '').split('.');
  if (parts.length !== 3) return { ok: false, reason: 'invalid' };
  const [id, expStr, sig] = parts;
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || !/^\d{9,11}$/.test(expStr)) return { ok: false, reason: 'invalid' };
  const expected = Buffer.from(mac(`${id}.${expStr}`));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return { ok: false, reason: 'invalid' };
  // Pay links never expire (owner rule): the signature alone is the proof. The exp field is kept only for URL compatibility.
  const inv = /^i_([0-9a-f-]{36})$/i.exec(id);
  if (inv) return { ok: true, subject: { kind: 'invoice', invoiceId: inv[1] } };
  const st = /^s_(\d{1,12})_(overdue|all)$/.exec(id);
  if (st) return { ok: true, subject: { kind: 'statement', advertiserId: Number(st[1]), scope: st[2] as 'overdue' | 'all' } };
  return { ok: false, reason: 'invalid' };
}
