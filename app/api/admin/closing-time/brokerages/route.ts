import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { addMember, listBrokerages, removeMember, saveBrokerage } from '@/lib/server/closing-time-brokerage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), id: z.string().uuid().optional(), name: z.string().trim().min(1).max(200), slug: z.string().min(1).max(60),
    emailDomains: z.array(z.string().max(120)).max(20), ssoEntryPoint: z.string().max(600).default(''), ssoIdpIssuer: z.string().max(600).default(''),
    ssoCert: z.string().max(8000).default(''), ssoEnabled: z.boolean().default(false) }),
  z.object({ action: z.literal('add_member'), brokerageId: z.string().uuid(), email: z.string().email(), role: z.enum(['agent', 'admin']) }),
  z.object({ action: z.literal('remove_member'), brokerageId: z.string().uuid(), realtorId: z.string().uuid() }),
]);

export const GET = withAdminTracking(async () => { await requireAdmin(); return NextResponse.json({ brokerages: await listBrokerages() }); });

export const POST = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  const input = body.parse(await req.json());
  if (input.action === 'save') return NextResponse.json({ ok: true, id: await saveBrokerage(input) });
  if (input.action === 'add_member') { await addMember(input.brokerageId, input.email, input.role); return NextResponse.json({ ok: true }); }
  await removeMember(input.brokerageId, input.realtorId);
  return NextResponse.json({ ok: true });
});
