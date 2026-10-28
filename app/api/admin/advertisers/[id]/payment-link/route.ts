import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { signPaymentSetupToken, paymentSetupUrl } from '@/lib/payment-setup-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

// POST { send?: boolean, to?: string }: returns the permanent client payment-method link,
// and emails it when send is true. Admin access is enforced by the /api/admin middleware.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const advId = Number(id);
  if (!Number.isInteger(advId)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  await ensureSchema();
  const rows = (await getSql()`SELECT name, contact_email, billing_email FROM advertisers WHERE id = ${advId}`) as unknown as Array<{ name: string; contact_email: string | null; billing_email: string | null }>;
  const adv = rows[0];
  if (!adv) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const url = paymentSetupUrl(signPaymentSetupToken({ kind: 'client', id: advId }).token);
  const body = (await req.json().catch(() => ({}))) as { send?: boolean; to?: string };
  const to = (body.to ?? adv.billing_email ?? adv.contact_email ?? '').trim();
  if (!body.send) return NextResponse.json({ url, to });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return NextResponse.json({ error: 'No valid email on file. Enter one.', url }, { status: 400 });
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#262626;font-size:15px;line-height:1.55">
<p>Hello,</p>
<p>Use the secure link below to add or update the payment method on file for ${esc(adv.name)}. You can choose a bank account (ACH) or a credit card. Nothing is charged when you save it.</p>
<p><a href="${url}" style="display:inline-block;background:#301D5D;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px">Update payment method</a></p>
<p style="font-size:13px;color:#6b6b6b">This link does not expire. Reply to this email if you have questions.</p></div>`;
  const text = `Use this secure link to add or update the payment method on file for ${adv.name}: ${url}\n\nYou can choose a bank account (ACH) or a credit card. Nothing is charged when you save it.`;
  const r = await sendEmail({ to, subject: `Update your payment method - ${adv.name}`, html, text });
  if (!r.ok) return NextResponse.json({ error: r.error ?? 'Email failed', url }, { status: 502 });
  return NextResponse.json({ url, to, sent: true });
}
