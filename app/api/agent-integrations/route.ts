import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { createConnectLink, disconnectAccount, listAccounts, pipedreamConfigured } from '@/lib/server/pipedream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SLUGS = ['google_calendar', 'microsoft_outlook_calendar', 'gmail', 'microsoft_outlook', 'google_drive', 'dropbox', 'microsoft_onedrive', 'slack', 'dotloop'] as const;
const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('connect'), app: z.enum(SLUGS) }),
  z.object({ action: z.literal('disconnect'), accountId: z.string().regex(/^apn_[a-zA-Z0-9]+$/) }),
]);

export const GET = withErrorHandling(async () => {
  const user = await requireUser();
  if (!pipedreamConfigured()) return NextResponse.json({ configured: false, accounts: [] });
  try {
    return NextResponse.json({ configured: true, accounts: await listAccounts(user.realtorId) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    return NextResponse.json({ configured: true, accounts: [], error: err instanceof Error ? err.message : 'Unavailable' });
  }
});

export const POST = withErrorHandling(async (req: Request) => {
  const user = await requireUser();
  if (!pipedreamConfigured()) throw new ApiError(503, 'Integrations are not turned on yet.');
  const input = body.parse(await req.json());
  try {
    if (input.action === 'connect') return NextResponse.json({ url: await createConnectLink(user.realtorId, input.app, new URL(req.url).origin) });
    await disconnectAccount(user.realtorId, input.accountId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    throw new ApiError(502, err instanceof Error ? err.message : 'Integration service unavailable');
  }
});
