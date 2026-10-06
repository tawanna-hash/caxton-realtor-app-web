import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { requireDeal } from '@/lib/server/closing-time-assist';
import { smsAllowedFor } from '@/lib/server/agent-deadline-notifications';
import { attestDealConsent, consentFor, listDealEmails, listDealTexts, sendDealEmail, sendDealOptIn, sendDealText } from '@/lib/server/closing-time-texts';
import { query } from '@/lib/server/db/neon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const priv = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
const dealId = z.string().min(1).max(120);
const person = { name: z.string().trim().min(1).max(200), phone: z.string().trim().min(7).max(30) };
const action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send'), dealId, ...person, body: z.string().trim().min(1).max(900) }),
  z.object({ action: z.literal('email'), dealId, subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(10000),
    to: z.array(z.object({ name: z.string().trim().min(1).max(200), email: z.string().trim().email().max(320) })).min(1).max(10) }),
  z.object({ action: z.literal('opt_in_request'), dealId, ...person }),
  z.object({ action: z.literal('confirm_agreed'), dealId, ...person }),
]);

export const GET = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  const url = new URL(req.url);
  const id = dealId.parse(url.searchParams.get('dealId'));
  const deal = await requireDeal(user.realtorId, id);
  const locked = deal.auditLocked === true;
  const emails = await listDealEmails(user.realtorId, id);
  const allowed = smsAllowedFor(user.email);
  if (!allowed) return priv({ allowed: false, locked, texts: [], emails, consent: {} });
  const phones = (url.searchParams.get('phones') ?? '').split(',').filter(Boolean);
  return priv({ allowed: true, locked, texts: await listDealTexts(user.realtorId, id), emails, consent: await consentFor(phones) });
});

export const POST = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  const input = action.parse(await req.json());
  const deal = await requireDeal(user.realtorId, input.dealId);
  const property = (deal.propertyAddress || deal.title || 'Your deal').trim();
  const sender = { realtorId: user.realtorId, email: user.email };
  if (input.action === 'email') {
    const me = await query<{ first_name: string | null; last_name: string | null }>(`SELECT first_name, last_name FROM realtors WHERE id=$1`, [user.realtorId]);
    return priv(await sendDealEmail(user.realtorId, input.dealId, property, { name: [me[0]?.first_name, me[0]?.last_name].filter(Boolean).join(' '), email: user.email }, input));
  }
  if (input.action === 'send') return priv(await sendDealText(sender, input.dealId, property, input));
  if (input.action === 'confirm_agreed') return priv(await attestDealConsent(sender, input.dealId, input));
  const me = await query<{ first_name: string | null; last_name: string | null }>(`SELECT first_name, last_name FROM realtors WHERE id=$1`, [user.realtorId]);
  const agentName = [me[0]?.first_name, me[0]?.last_name].filter(Boolean).join(' ');
  return priv(await sendDealOptIn(sender, input.dealId, property, agentName, input));
});
