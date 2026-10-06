import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { requireDeal } from '@/lib/server/closing-time-assist';
import { smsAllowedFor } from '@/lib/server/agent-deadline-notifications';
import { mailboxState, setMessageLayout, setReadReplies, syncMailboxReplies } from '@/lib/server/closing-time-mailbox';
import { CONTACT_SCOPE, listContactActivity, attestDealConsent, listContactMessages, consentFor, listDealEmails, listDealTexts, sendDealEmail, sendDealOptIn, sendDealText } from '@/lib/server/closing-time-texts';
import { query } from '@/lib/server/db/neon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const priv = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
const dealId = z.string().min(1).max(120);
const person = { name: z.string().trim().min(1).max(200), phone: z.string().trim().min(7).max(30) };
const action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send'), dealId, ...person, body: z.string().trim().min(1).max(900), requests: z.array(z.object({ label: z.string().trim().min(1).max(200) })).max(15).optional() }),
  z.object({ action: z.literal('email'), dealId, subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(10000),
    to: z.array(z.object({ name: z.string().trim().min(1).max(200), email: z.string().trim().email().max(320) })).min(1).max(10),
    cc: z.array(z.string().trim().email().max(320)).max(10).optional(),
    requests: z.array(z.object({ label: z.string().trim().min(1).max(200), note: z.string().trim().max(500).optional() })).max(15).optional(),
    attachments: z.array(z.object({ filename: z.string().trim().min(1).max(200), content: z.string().max(4_200_000), contentType: z.string().max(120).optional() })).max(5).optional() }),
  z.object({ action: z.literal('mailbox_read'), on: z.boolean() }),
  z.object({ action: z.literal('mailbox_check') }),
  z.object({ action: z.literal('message_layout'), value: z.enum(['inbox', 'timeline', 'strip', 'threads']) }),
  z.object({ action: z.literal('opt_in_request'), dealId, ...person }),
  z.object({ action: z.literal('confirm_agreed'), dealId, ...person }),
]);

export const GET = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  const url = new URL(req.url);
  const id = dealId.parse(url.searchParams.get('dealId'));
  const phones = (url.searchParams.get('phones') ?? '').split(',').filter(Boolean);
  const allowed = smsAllowedFor(user.email);
  await syncMailboxReplies(user.realtorId).catch(() => undefined);
  const mailbox = await mailboxState(user.realtorId).catch(() => null);
  if (id === CONTACT_SCOPE) {
    // Contacts stay open after a deal is closed and locked: this is the ongoing thread with a current or past client.
    const who = { name: url.searchParams.get('name') ?? '', email: url.searchParams.get('email') ?? '', phone: url.searchParams.get('phone') ?? '' };
    const m = await listContactMessages(user.realtorId, who);
    return priv({ allowed, locked: false, mailbox, activity: await listContactActivity(user.realtorId, who.name), texts: allowed ? m.texts : [], emails: m.emails, consent: allowed ? await consentFor(phones) : {} });
  }
  const deal = await requireDeal(user.realtorId, id);
  const locked = deal.auditLocked === true;
  const emails = await listDealEmails(user.realtorId, id);
  if (!allowed) return priv({ allowed: false, locked, mailbox, texts: [], emails, consent: {} });
  return priv({ allowed: true, locked, mailbox, texts: await listDealTexts(user.realtorId, id), emails, consent: await consentFor(phones) });
});

export const POST = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  const input = action.parse(await req.json());
  if (input.action === 'mailbox_read') { await setReadReplies(user.realtorId, input.on); if (input.on) await syncMailboxReplies(user.realtorId, true).catch(() => undefined); return priv({ ok: true }); }
  if (input.action === 'message_layout') { await setMessageLayout(user.realtorId, input.value); return priv({ ok: true }); }
  if (input.action === 'mailbox_check') return priv({ ok: true, ...(await syncMailboxReplies(user.realtorId, true)) });
  const isContact = input.dealId === CONTACT_SCOPE;
  const deal = isContact ? null : await requireDeal(user.realtorId, input.dealId);
  const meRow = await query<{ first_name: string | null; last_name: string | null }>(`SELECT first_name, last_name FROM realtors WHERE id=$1`, [user.realtorId]);
  const agentLabel = [meRow[0]?.first_name, meRow[0]?.last_name].filter(Boolean).join(' ');
  const property = isContact ? (agentLabel || 'Your agent') : (deal?.propertyAddress || deal?.title || 'Your deal').trim();
  const sender = { realtorId: user.realtorId, email: user.email };
  if (input.action === 'email') {
    const me = await query<{ first_name: string | null; last_name: string | null }>(`SELECT first_name, last_name FROM realtors WHERE id=$1`, [user.realtorId]);
    return priv(await sendDealEmail(user.realtorId, input.dealId, property, { name: [me[0]?.first_name, me[0]?.last_name].filter(Boolean).join(' '), email: user.email }, input, new URL(req.url).origin));
  }
  if (input.action === 'send') return priv(await sendDealText(sender, input.dealId, property, input, new URL(req.url).origin));
  if (input.action === 'confirm_agreed') return priv(await attestDealConsent(sender, input.dealId, input));
  const me = await query<{ first_name: string | null; last_name: string | null }>(`SELECT first_name, last_name FROM realtors WHERE id=$1`, [user.realtorId]);
  const agentName = [me[0]?.first_name, me[0]?.last_name].filter(Boolean).join(' ');
  return priv(await sendDealOptIn(sender, input.dealId, property, agentName, input));
});
