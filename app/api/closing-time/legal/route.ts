import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { getLegalAcceptance, recordLegalAcceptance } from '@/lib/server/closing-time-legal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

export const GET = withErrorHandling(async (): Promise<Response> => {
  const user = await requireUser();
  return NextResponse.json(await getLegalAcceptance(user.realtorId), { headers: NO_STORE });
});

export const POST = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  const body = z.object({ accept: z.literal(true) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Agreement is required' }, { status: 400, headers: NO_STORE });
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  await recordLegalAcceptance(user.realtorId, ip, req.headers.get('user-agent'));
  return NextResponse.json(await getLegalAcceptance(user.realtorId), { headers: NO_STORE });
});
