// app/api/admin/insertion-orders/[id]/pdf/route.ts
//
// GET — Stream a branded single-page PDF for the given insertion order.
// Uses lib/insertion-order-pdf.ts (Inter + RNN purple palette).

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { ensureSchema, getSql } from '@/lib/db';
import { getInsertionOrder } from '@/lib/server/insertion-orders-store';
import { generateInsertionOrderPdfBuffer } from '@/lib/insertion-order-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await ensureSchema();
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  const io = await getInsertionOrder(id);
  if (!io) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // If the advertiser/agency provided their own IO PDF, proxy it through
  // rather than generating our own. Most-recent-upload-wins.
  if (io.pdf_url) {
    try {
      const r = await fetch(io.pdf_url);
      if (r.ok) {
        const buf = await r.arrayBuffer();
        return new NextResponse(Buffer.from(buf), {
          status: 200,
          headers: {
            'content-type': r.headers.get('content-type') ?? 'application/pdf',
            'content-disposition': `inline; filename="${io.io_number}.pdf"`,
            'cache-control': 'no-store',
          },
        });
      }
      // Fall through to generated renderer on non-2xx.
    } catch {
      // Fall through to generated renderer on fetch failure.
    }
  }

  // Advertiser lookup
  let advertiserName = '—';
  let advertiserEmail: string | null = null;
  let advertiserPhone: string | null = null;
  if (io.advertiser_id) {
    const sql = getSql();
    const rows = (await sql`
      SELECT name, email, phone
        FROM advertisers
       WHERE id = ${io.advertiser_id}
       LIMIT 1
    `) as unknown as Array<{ name: string; email: string | null; phone: string | null }>;
    if (rows[0]) {
      advertiserName = rows[0].name ?? '—';
      advertiserEmail = rows[0].email;
      advertiserPhone = rows[0].phone;
    }
  }

  const pdf = await generateInsertionOrderPdfBuffer({
    io,
    advertiserName,
    advertiserEmail,
    advertiserPhone,
  });

  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${io.io_number}.pdf"`,
      'cache-control': 'no-store',
    },
  });
}
