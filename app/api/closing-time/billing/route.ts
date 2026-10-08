import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { billingState, confirmDealPayment, confirmExtensionPayment, createDealPayment, createExtensionPayment, extensionNeedsPayment, reserveDeal } from '@/lib/server/closing-time-billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const dealId = z.string().min(1).max(120);
const action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reserve'), dealId }),
  z.object({ action: z.literal('intent'), dealId }),
  z.object({ action: z.literal('confirm'), dealId, paymentIntentId: z.string().min(1).max(200) }),
  z.object({ action: z.literal('extension_reserve'), dealId, extensions: z.number().int().min(0).max(100) }),
  z.object({ action: z.literal('extension_intent'), dealId, extensions: z.number().int().min(0).max(100) }),
  z.object({ action: z.literal('extension_confirm'), dealId, paymentIntentId: z.string().min(1).max(200) }),
]);
const priv = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });

export const GET = withErrorHandling(async (): Promise<Response> => {
  const user = await requireUser();
  return priv(await billingState(user.realtorId, user.email));
});

export const POST = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  const body = action.parse(await req.json());
  if (body.action === 'reserve') return priv(await reserveDeal(user.realtorId, user.email, body.dealId));
  if (body.action === 'intent') return priv(await createDealPayment(user.realtorId, user.email, body.dealId));
  if (body.action === 'extension_reserve') return priv(extensionNeedsPayment(user.email, body.extensions) ? { ok: false, paymentRequired: true } : { ok: true });
  if (body.action === 'extension_intent') return priv(await createExtensionPayment(user.realtorId, user.email, body.dealId, body.extensions));
  if (body.action === 'extension_confirm') {
    const done = await confirmExtensionPayment(user.realtorId, body.dealId, body.paymentIntentId);
    return priv({ ok: done }, done ? 200 : 402);
  }
  const paid = await confirmDealPayment(user.realtorId, body.dealId, body.paymentIntentId);
  return priv({ ok: paid }, paid ? 200 : 402);
});
