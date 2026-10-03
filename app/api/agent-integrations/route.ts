import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { createConnectLink, disconnectAccount, listAccounts, composioConfigured, appInfo, availableApps } from '@/lib/server/composio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('connect'), app: z.string().regex(/^[a-z0-9_]{2,40}$/).refine((v) => appInfo(v) !== null, 'Unknown integration') }),
  z.object({ action: z.literal('disconnect'), accountId: z.string().regex(/^ca_[a-zA-Z0-9_-]+$/) }),
]);

export const GET = withErrorHandling(async () => {
  const user = await requireUser();
  if (!composioConfigured()) return NextResponse.json({ configured: false, accounts: [] });
  try {
    const [accounts, catalog] = await Promise.all([listAccounts(user.realtorId), availableApps().catch(() => [])]);
    return NextResponse.json({ configured: true, accounts, catalog }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    return NextResponse.json({ configured: true, accounts: [], error: err instanceof Error ? err.message : 'Unavailable' });
  }
});

export const POST = withErrorHandling(async (req: Request) => {
  const user = await requireUser();
  if (!composioConfigured()) throw new ApiError(503, 'Integrations are not turned on yet.');
  const input = body.parse(await req.json());
  try {
    if (input.action === 'connect') return NextResponse.json({ url: await createConnectLink(user.realtorId, input.app, new URL(req.url).origin) });
    await disconnectAccount(user.realtorId, input.accountId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    throw new ApiError(502, err instanceof Error ? err.message : 'Integration service unavailable');
  }
});
