import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { requireDeal } from '@/lib/server/closing-time-assist';
import { createPoll, deletePoll, finalizePoll, listPolls, remindPoll, reopenPoll } from '@/lib/server/closing-time-polls';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const dealId = z.string().min(1).max(120);
const action = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'), dealId,
    title: z.string().trim().min(1).max(160), location: z.string().trim().max(300).default(''),
    durationMin: z.number().int().min(15).max(480).default(60), note: z.string().trim().max(800).default(''),
    options: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) })).min(1).max(20),
    invitees: z.array(z.object({ name: z.string().trim().min(1).max(200), email: z.string().trim().max(320).default('') })).min(1).max(15),
    email: z.boolean().default(false),
  }),
  z.object({ action: z.literal('finalize'), pollId: z.string().uuid(), optionId: z.string().uuid(), notify: z.boolean().default(false) }),
  z.object({ action: z.literal('remind'), pollId: z.string().uuid() }),
  z.object({ action: z.literal('reopen'), pollId: z.string().uuid() }),
  z.object({ action: z.literal('delete'), pollId: z.string().uuid() }),
]);

const priv = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });

export const GET = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  const id = dealId.parse(new URL(req.url).searchParams.get('dealId'));
  await requireDeal(user.realtorId, id);
  return priv({ polls: await listPolls(user.realtorId, id) });
});

export const POST = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  const input = action.parse(await req.json());
  const origin = new URL(req.url).origin;
  switch (input.action) {
    case 'create': {
      const { emailed } = await createPoll(user.realtorId, input.dealId, { ...input, origin, replyTo: user.email });
      return priv({ ok: true, emailed, polls: await listPolls(user.realtorId, input.dealId) });
    }
    case 'finalize': return priv({ ok: true, emailed: await finalizePoll(user.realtorId, input.pollId, input.optionId, input.notify, origin, user.email) });
    case 'remind': return priv({ ok: true, emailed: await remindPoll(user.realtorId, input.pollId, origin, user.email) });
    case 'reopen': await reopenPoll(user.realtorId, input.pollId); return priv({ ok: true });
    case 'delete': await deletePoll(user.realtorId, input.pollId); return priv({ ok: true });
  }
});
