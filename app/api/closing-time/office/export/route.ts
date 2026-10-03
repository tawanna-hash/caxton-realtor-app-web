import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { getAdminBrokerage, officeCsv, officeOverview } from '@/lib/server/closing-time-brokerage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (): Promise<Response> => {
  const user = await requireUser();
  const b = await getAdminBrokerage(user.realtorId);
  if (!b) return new Response('Not found', { status: 404 });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
  return new Response(officeCsv(await officeOverview(b.id, today)), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="office-deals.csv"', 'Cache-Control': 'private, no-store' } });
});
