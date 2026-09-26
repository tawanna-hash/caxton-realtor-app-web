import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import {
  getOrCreateCalendarFeedToken,
  resetCalendarFeedToken,
} from '@/lib/server/closing-time-calendar-feeds';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function feedResponse(req: Request, token: string): NextResponse {
  const origin = new URL(req.url).origin;
  const url = `${origin}/api/closing-time/calendar/${token}.ics`;
  return NextResponse.json(
    { url, webcalUrl: url.replace(/^https?:\/\//, 'webcal://') },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
  );
}

/** Returns the signed-in agent's private calendar subscription link. */
export const GET = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  return feedResponse(req, await getOrCreateCalendarFeedToken(user.realtorId));
});

/** Replaces the agent's link; the previous link stops working immediately. */
export const POST = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  return feedResponse(req, await resetCalendarFeedToken(user.realtorId));
});
