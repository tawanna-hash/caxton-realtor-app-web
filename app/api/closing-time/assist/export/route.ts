import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { auditCsv } from '@/lib/server/closing-time-assist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Audit export of one deal's file history: activity, follow-ups, and client uploads. */
export const GET = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  const dealId = new URL(req.url).searchParams.get('dealId') ?? '';
  const csv = await auditCsv(user.realtorId, dealId);
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="deal-file-history.csv"', 'Cache-Control': 'private, no-store' } });
});
