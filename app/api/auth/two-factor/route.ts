import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { z } from 'zod';
import { requireUser } from '@/lib/server/auth/user';
import { ApiError, withErrorHandling } from '@/lib/server/error';
import { rateLimit } from '@/lib/server/rate-limit';
import { getRealtorMe } from '@/lib/server/realtors-store';
import { beginSetup, confirmSetup, disableTwoFactor, isTwoFactorEnabled } from '@/lib/server/two-factor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const H = { 'Cache-Control': 'private, no-store, max-age=0' };
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: H });

export const GET = withErrorHandling(async (): Promise<Response> => {
  const user = await requireUser();
  return json({ enabled: await isTwoFactorEnabled(user.realtorId) });
});

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('setup') }),
  z.object({ action: z.literal('enable'), code: z.string().trim().min(6).max(12) }),
  z.object({ action: z.literal('disable'), code: z.string().trim().min(6).max(12) }),
]);

export const POST = withErrorHandling(async (req: Request): Promise<Response> => {
  await rateLimit('auth');
  const user = await requireUser();
  const input = schema.parse(await req.json());
  try {
    if (input.action === 'setup') {
      const me = await getRealtorMe(user.realtorId);
      if (!me || me.password_set_at === null) throw new Error('Set a password first. Two-step sign-in works with email and password.');
      const { secret, otpauthUrl } = await beginSetup(user.realtorId, me.email);
      return json({ secret, qr: await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 }) });
    }
    if (input.action === 'enable') return json({ enabled: true, recoveryCodes: await confirmSetup(user.realtorId, input.code) });
    await disableTwoFactor(user.realtorId, input.code);
    return json({ enabled: false });
  } catch (e) { throw new ApiError(400, e instanceof Error ? e.message : 'Request failed'); }
});
