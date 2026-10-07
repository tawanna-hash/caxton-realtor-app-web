import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/server/auth/user';
import { ApiError, withErrorHandling } from '@/lib/server/error';
import {
  WEBHOOK_EVENTS, createApiKey, createWebhook, deleteWebhook, listApiKeys, listWebhooks, revokeApiKey,
} from '@/lib/server/closing-time-automation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const H = { 'Cache-Control': 'private, no-store, max-age=0' };
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: H });

export const GET = withErrorHandling(async (): Promise<Response> => {
  const user = await requireUser();
  const [keys, webhooks] = await Promise.all([listApiKeys(user.realtorId), listWebhooks(user.realtorId)]);
  return json({ keys, webhooks, events: WEBHOOK_EVENTS });
});

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create-key'), name: z.string().trim().min(1).max(60) }),
  z.object({ action: z.literal('revoke-key'), id: z.string().uuid() }),
  z.object({ action: z.literal('create-webhook'), url: z.string().trim().max(500), events: z.array(z.enum(WEBHOOK_EVENTS)).min(1) }),
  z.object({ action: z.literal('delete-webhook'), id: z.string().uuid() }),
]);

export const POST = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  const input = schema.parse(await req.json());
  try {
    if (input.action === 'create-key') return json(await createApiKey(user.realtorId, input.name));
    if (input.action === 'revoke-key') { await revokeApiKey(user.realtorId, input.id); return json({ ok: true }); }
    if (input.action === 'create-webhook') return json(await createWebhook(user.realtorId, input.url, input.events));
    await deleteWebhook(user.realtorId, input.id);
    return json({ ok: true });
  } catch (e) { throw new ApiError(400, e instanceof Error ? e.message : 'Request failed'); }
});
