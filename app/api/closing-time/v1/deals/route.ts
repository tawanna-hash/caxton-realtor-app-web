import { NextResponse } from 'next/server';
import { getAgentCommandCenterWorkspace } from '@/lib/server/agent-command-center-workspaces';
import { publicDeal, realtorIdForApiKey } from '@/lib/server/closing-time-automation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const H = { 'Cache-Control': 'private, no-store, max-age=0' };

// GET /api/closing-time/v1/deals  (Authorization: Bearer ct_live_...)
// Optional: ?sort=created (default is most recently updated first)  ?limit=100  ?status=active  ?updated_since=2026-10-01T00:00:00Z  (newest first, for polling triggers)
export async function GET(req: Request): Promise<Response> {
  const realtorId = await realtorIdForApiKey(req.headers.get('authorization'));
  if (!realtorId) return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401, headers: H });
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const since = url.searchParams.get('updated_since');
  const sinceMs = since ? Date.parse(since) : NaN;
  const sortKey = url.searchParams.get('sort') === 'created' ? 'created' : 'updated';
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 100));
  const stored = await getAgentCommandCenterWorkspace(realtorId);
  const deals = (stored?.workspace.deals ?? [])
    .filter((d) => !d.isTemplate)
    .filter((d) => !status || d.status === status)
    .filter((d) => Number.isNaN(sinceMs) || Date.parse(d.updatedAt) >= sinceMs)
    .sort((a, b) => Date.parse(sortKey === 'created' ? b.createdAt : b.updatedAt) - Date.parse(sortKey === 'created' ? a.createdAt : a.updatedAt))
    .slice(0, limit)
    .map(publicDeal);
  return NextResponse.json({ data: deals, count: deals.length }, { headers: H });
}
