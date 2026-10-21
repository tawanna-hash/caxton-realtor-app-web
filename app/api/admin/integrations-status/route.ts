import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { isGmailOAuthConfigured } from '@/lib/server/gmail-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({
    stripe: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
    stripe_mode: process.env.STRIPE_SECRET_KEY?.startsWith('sk_live') ? 'live' : process.env.STRIPE_SECRET_KEY ? 'test' : null,
    gmail_configured: isGmailOAuthConfigured(),
  });
}
