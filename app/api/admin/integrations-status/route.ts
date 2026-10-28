import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { isGmailOAuthConfigured } from '@/lib/server/gmail-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({
    stripe: false,
    stripe_mode: null,
    gmail_configured: isGmailOAuthConfigured(),
  });
}
