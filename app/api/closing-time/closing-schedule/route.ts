import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { cancelRequest, closingContext, createRequest } from '@/lib/server/closing-time-closing-schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const priv = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
const person = z.object({ name: z.string().max(200).default(''), email: z.string().max(200), role: z.string().max(80).default('') });
const action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), dealId: z.string().min(1).max(120), titleName: z.string().max(200).default(''), titleEmail: z.string().max(200), choosers: z.array(person).max(10), recipients: z.array(person).max(40) }),
  z.object({ action: z.literal('cancel'), id: z.string().uuid() }),
]);

export const GET = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  const dealId = z.string().min(1).max(120).parse(new URL(req.url).searchParams.get('dealId'));
  return priv(await closingContext(user.realtorId, dealId));
});

export const POST = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  const parsed = action.safeParse(await req.json());
  if (!parsed.success) return priv({ error: parsed.error.issues[0]?.message ?? 'Check the form.' }, 400);
  const i = parsed.data;
  if (i.action === 'create') await createRequest(user.realtorId, i.dealId, { ...i, origin: new URL(req.url).origin });
  else await cancelRequest(user.realtorId, i.id);
  return priv({ ok: true });
});
