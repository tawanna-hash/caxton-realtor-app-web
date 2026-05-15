import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// TEMPORARY diagnostic endpoint — remove after Mailchimp env vars
// are confirmed working. Returns shape info only, never the key itself.
export async function GET() {
  const key = process.env.MAILCHIMP_API_KEY;
  const server = process.env.MAILCHIMP_SERVER;
  
  return NextResponse.json({
    has_api_key: !!key,
    api_key_length: key?.length || 0,
    api_key_prefix: key?.slice(0, 4) || null,
    api_key_suffix: key?.slice(-5) || null,
    api_key_has_whitespace: key ? key !== key.trim() : false,
    has_server: !!server,
    server_value: server || null,
    server_length: server?.length || 0,
  });
}
