import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { createTrecDeal, listTrecDeals } from '@/lib/server/trec-deals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const dealSchema = z.object({
  title: z.string().trim().max(180).optional(),
  worksheet: z.record(z.string(), z.string().max(20_000)),
  addenda: z.record(z.string(), z.boolean()),
  workflowStatus: z.enum(['intake', 'contract_review', 'active_transaction', 'closing', 'completed', 'cancelled']).optional(),
  assignedTo: z.string().trim().max(160).nullable().optional(),
});

function dealTitle(input: z.infer<typeof dealSchema>): string {
  return input.title || input.worksheet.propertyAddress || input.worksheet.buyerNames || 'Untitled TREC deal';
}

function isReasonablePayload(value: unknown): boolean {
  return JSON.stringify(value).length <= 100_000;
}

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    return NextResponse.json({ deals: await listTrecDeals() });
  } catch (error) {
    console.error('[trec-deals GET]', error);
    return NextResponse.json({ error: 'Could not load saved deals.' }, { status: 500 });
  }
}

export const POST = withAdminTracking(async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = dealSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isReasonablePayload(parsed.data)) {
    return NextResponse.json({ error: 'Enter valid deal-prep details.' }, { status: 400 });
  }

  try {
    const deal = await createTrecDeal({
      id: randomUUID(),
      title: dealTitle(parsed.data),
      worksheet: parsed.data.worksheet,
      addenda: parsed.data.addenda,
      workflowStatus: parsed.data.workflowStatus,
      assignedTo: parsed.data.assignedTo,
      createdBy: admin.email,
    });
    return NextResponse.json({ deal }, { status: 201 });
  } catch (error) {
    console.error('[trec-deals POST]', error);
    return NextResponse.json({ error: 'Could not save this deal.' }, { status: 500 });
  }
});
