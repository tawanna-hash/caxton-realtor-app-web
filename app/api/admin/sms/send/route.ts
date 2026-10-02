/** POST /api/admin/sms/send { audience, text, to: [...] } - text opted-in numbers, skipping opted-out ones (admin only). */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { sendSms } from '@/lib/server/sms';

export const runtime = 'nodejs';
export const maxDuration = 120;

const schema = z.object({
  audience: z.string().min(1).max(100),
  text: z.string().min(1).max(1600),
  to: z.array(z.string()).min(1).max(500),
});

export const POST = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  const body = schema.parse(await req.json());
  return NextResponse.json(await sendSms(body.audience, body.text, body.to));
});
