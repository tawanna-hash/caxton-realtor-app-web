// Dallas/Ft. Worth market reports (latest month per board and area).
// Pre-launch: only Dallas preview accounts may read it.

import { canViewDallasPreview, dallasForbidden } from '@/lib/server/dallas-preview';
import { listLatestDfwReports } from '@/lib/server/dfw-market-reports-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await canViewDallasPreview())) return dallasForbidden();
  const data = await listLatestDfwReports();
  return Response.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
}
