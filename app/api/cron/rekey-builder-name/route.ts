// app/api/cron/rekey-builder-name/route.ts
//
// Admin maintenance (manual, NOT scheduled): rename a builder across
// builder_inventory so its rows roll up under the canonical builder name.
// Used to fix mis-keyed submissions — e.g. a "Drees Custom Homes" promotion
// that should be "Drees Homes".
//
// Auth: Authorization: Bearer ${CRON_SECRET} in production (open in dev so we
// can test locally). Not in vercel.json crons — invoke manually with
// ?from=<old name>&to=<new name>.

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const auth = req.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  return req.headers.get('x-vercel-cron') === '1';
}

export async function GET(req: Request) {
  if (process.env.VERCEL_ENV === 'production' && !authorized(req)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get('from')?.trim();
  const to = url.searchParams.get('to')?.trim();
  if (!from || !to) {
    return NextResponse.json(
      { ok: false, error: 'Missing "from" or "to" query param' },
      { status: 400 },
    );
  }
  if (from === to) {
    return NextResponse.json({ ok: true, renamed: 0, note: 'from === to' });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const started = Date.now();
  try {
    const rows = (await sql`
      UPDATE builder_inventory
      SET builder_name = ${to}
      WHERE builder_name = ${from}
      RETURNING id, builder_name, title, kind, home_type, status, publication
    `) as Record<string, unknown>[];
    return NextResponse.json({
      ok: true,
      ms: Date.now() - started,
      from,
      to,
      renamed: rows.length,
      rows: rows.slice(0, 50),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
