import { NextResponse } from 'next/server';
import { getAgentCommandCenterWorkspace } from '@/lib/server/agent-command-center-workspaces';
import { publicDeal, realtorIdForApiKey } from '@/lib/server/closing-time-automation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const H = { 'Cache-Control': 'private, no-store, max-age=0' };

// GET /api/closing-time/v1/deals  (Authorization: Bearer ct_live_...)
// Optional: ?status=active  ?updated_since=2026-10-01T00:00:00Z  (newest first, for polling triggers)
export async function GET(req: Request): Promise<Response> {
  const realtorId = await realtorIdForApiKey(req.headers.get('authorization'));
  if (!realtorId) return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401, headers: H });
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const since = url.searchParams.get('updated_since');
  const sinceMs = since ? Date.parse(since) : NaN;
  const stored = await getAgentCommandCenterWorkspace(realtorId);
  const deals = (stored?.workspace.deals ?? [])
    .filter((d) => !d.isTemplate)
    .filter((d) => !status || d.status === status)
    .filter((d) => Number.isNaN(sinceMs) || Date.parse(d.updatedAt) >= sinceMs)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .map(publicDeal);
  return NextResponse.json({ data: deals, count: deals.length }, { headers: H });
}
