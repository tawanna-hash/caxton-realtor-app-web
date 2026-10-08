import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { billingState, confirmDealPayment, createDealPayment, reserveDeal } from '@/lib/server/closing-time-billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const dealId = z.string().min(1).max(120);
const action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reserve'), dealId }),
  z.object({ action: z.literal('intent'), dealId }),
  z.object({ action: z.literal('confirm'), dealId, paymentIntentId: z.string().min(1).max(200) }),
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
  const paid = await confirmDealPayment(user.realtorId, body.dealId, body.paymentIntentId);
  return priv({ ok: paid }, paid ? 200 : 402);
});
