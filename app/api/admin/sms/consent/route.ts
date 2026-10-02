/** POST /api/admin/sms/consent { phone, audience, source } - record an SMS opt-in (admin only). */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { recordConsent, toE164 } from '@/lib/server/sms';

export const runtime = 'nodejs';

const schema = z.object({
  phone: z.string().min(7),
  audience: z.string().min(1).max(100),
  source: z.string().min(1).max(100),
});

export const POST = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  const body = schema.parse(await req.json());
  const phone = toE164(body.phone);
  if (!phone) return NextResponse.json({ error: 'Invalid US phone number' }, { status: 400 });
  await recordConsent(phone, body.audience, body.source);
  return NextResponse.json({ ok: true, phone });
});
