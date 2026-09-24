import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { sendAgentDeadlineTestAlert } from '@/lib/server/agent-deadline-notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  await requireAdmin();
  const body = (await req.json().catch(() => ({}))) as { email?: string; emailTo?: string };
  if (!body.email) return NextResponse.json({ error: 'email required' }, { status: 400 });
  const result = await sendAgentDeadlineTestAlert(body.email, body.emailTo);
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
