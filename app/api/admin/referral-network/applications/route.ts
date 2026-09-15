import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth/admin';
import {
  listReferralNetworkApplications,
  updateReferralNetworkApplication,
  type ReferralApplicationStatus,
} from '@/lib/server/referral-network-applications';

export const runtime = 'nodejs';

const statuses = ['pending', 'contacted', 'approved', 'declined'] as const;
const updateSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(statuses),
  reviewNotes: z.string().trim().max(4000).optional().default(''),
});

function validStatus(value: string | null): value is ReferralApplicationStatus {
  return Boolean(value && statuses.includes(value as ReferralApplicationStatus));
}

export async function GET(req: NextRequest) {
  await requireAdmin();
  const status = new URL(req.url).searchParams.get('status');
  return NextResponse.json({
    rows: await listReferralNetworkApplications(validStatus(status) ? status : undefined),
  });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid review update.' }, { status: 400 });
  }
  const row = await updateReferralNetworkApplication(parsed.data.id, {
    status: parsed.data.status,
    reviewNotes: parsed.data.reviewNotes,
    reviewedBy: admin.email,
  });
  if (!row) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
  return NextResponse.json({ application: row });
}
