/** GET /api/closing-time/template-defaults - platform default contract layout, forms and task lists for new accounts. */
import { NextResponse } from 'next/server';
import { BUILT_IN_TEMPLATE_DEFAULTS, getTemplateDefaults } from '@/lib/server/platform-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try { return NextResponse.json(await getTemplateDefaults(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json(BUILT_IN_TEMPLATE_DEFAULTS); }
}
