import { getAgentCommandCenterWorkspace } from '@/lib/server/agent-command-center-workspaces';
import { findRealtorIdByFeedToken } from '@/lib/server/closing-time-calendar-feeds';
import { buildClosingTimeIcs, calendarEventsForActiveDeals } from '@/lib/closing-time-calendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

/**
 * Public subscription feed for a single agent's active Closing Time deals.
 * Access is controlled only by the unguessable token in the URL.
 */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const { token: rawToken } = await ctx.params;
  const token = rawToken.replace(/\.ics$/i, '');
  const realtorId = await findRealtorIdByFeedToken(token);
  if (!realtorId) {
    return new Response('Calendar link not found or has been reset.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const record = await getAgentCommandCenterWorkspace(realtorId);
  const events = calendarEventsForActiveDeals(record?.workspace.deals ?? []);
  const body = buildClosingTimeIcs(events, { calendarName: 'Closing Time Deadlines', feed: true });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="closing-time.ics"',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
