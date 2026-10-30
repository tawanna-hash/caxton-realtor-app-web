// Signed, permanent, read-only links that let a partner view their own invoice history.
import crypto from 'node:crypto';

function mac(id: string): string {
  const s = process.env.SIGN_SECRET;
  if (!s) throw new Error('SIGN_SECRET is not configured');
  return crypto.createHmac('sha256', s).update(`invoice_history:${id}`).digest('base64url');
}

export function invoiceHistoryUrl(advertiserId: number): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtynewsnow.app').replace(/\/+$/, '');
  return `${base}/pay/history/${advertiserId}.${mac(String(advertiserId))}`;
}

export function verifyInvoiceHistoryToken(token: string): number | null {
  const [id, sig, extra] = (token ?? '').split('.');
  if (extra !== undefined || !id || !sig || !/^\d{1,12}$/.test(id)) return null;
  const expected = Buffer.from(mac(id));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  return Number(id);
}
