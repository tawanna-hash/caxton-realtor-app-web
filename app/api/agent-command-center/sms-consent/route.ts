import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { smsAllowedFor } from '@/lib/server/agent-deadline-notifications';
import { recordConsent, toE164 } from '@/lib/server/sms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ phone: z.string().trim().min(7).max(20) }).strict();

// The agent turned on text alerts for their own number in Settings: store that consent.
export const POST = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  if (!smsAllowedFor(user.email)) return NextResponse.json({ error: 'Text alerts are not available on this account yet.' }, { status: 403 });
  const { phone } = bodySchema.parse(await req.json());
  const e164 = toE164(phone);
  if (!e164) return NextResponse.json({ error: 'Enter a 10-digit US mobile number.' }, { status: 400 });
  await recordConsent(e164, 'closing-time-alerts', 'closing-time-settings');
  return NextResponse.json({ ok: true, phone: e164 }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
});
