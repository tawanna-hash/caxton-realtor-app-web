import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { AUTOMATION_DEFS, getAutomations, setAutomation } from '@/lib/server/closing-time-automations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const H = { 'Cache-Control': 'private, no-store, max-age=0' };
const keys = AUTOMATION_DEFS.map((d) => d.key) as [string, ...string[]];

export const GET = withErrorHandling(async (): Promise<Response> => {
  const user = await requireUser();
  return NextResponse.json({ defs: AUTOMATION_DEFS, state: await getAutomations(user.realtorId) }, { headers: H });
});

export const POST = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  const input = z.object({ key: z.enum(keys), on: z.boolean() }).parse(await req.json());
  const state = await setAutomation(user.realtorId, input.key as never, input.on);
  return NextResponse.json({ state }, { headers: H });
});
