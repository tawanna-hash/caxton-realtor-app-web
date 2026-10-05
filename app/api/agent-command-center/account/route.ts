import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import {
  agentAccountDetailsSchema,
  getAgentAccountDetails,
  saveAgentAccountDetails,
} from '@/lib/server/agent-account-details';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const privateResponse = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });

export const GET = withErrorHandling(async (): Promise<Response> => {
  const user = await requireUser();
  return privateResponse({ details: await getAgentAccountDetails(user.realtorId) });
});

export const PUT = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  const details = agentAccountDetailsSchema.parse(await req.json());
  return privateResponse({ details: await saveAgentAccountDetails(user.realtorId, details) });
});
