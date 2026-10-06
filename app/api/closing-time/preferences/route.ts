import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { getHoverTips, setHoverTips } from '@/lib/server/closing-time-mailbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const priv = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });

export const GET = withErrorHandling(async (): Promise<Response> => {
  const user = await requireUser();
  return priv({ hoverTips: await getHoverTips(user.realtorId) });
});

export const POST = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  const input = z.object({ hoverTips: z.boolean() }).parse(await req.json());
  await setHoverTips(user.realtorId, input.hoverTips);
  return priv({ ok: true, hoverTips: input.hoverTips });
});
