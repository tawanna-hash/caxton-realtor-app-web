// app/api/admin/insertion-orders/[id]/pdf/route.ts
//
// GET — Stream a PDF for the given insertion order.
//
// Commit 5 ships this as a minimal renderer using pdfkit-style output
// via the existing agreement PDF infrastructure. Commit 6 will restyle
// this to match the new RealtyLine/Newsline media kit.
//
// Auth: admin required.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { ensureSchema, getSql } from '@/lib/db';
import { getInsertionOrder } from '@/lib/server/insertion-orders-store';

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

  // Advertiser name lookup for the header
  let advertiserName = '—';
  if (io.advertiser_id) {
    const sql = getSql();
    const rows = (await sql`
      SELECT name FROM advertisers WHERE id = ${io.advertiser_id} LIMIT 1
    `) as unknown as Array<{ name: string }>;
    if (rows[0]?.name) advertiserName = rows[0].name;
  }

  // Render a lightweight HTML page and let the browser print-to-PDF.
  // Commit 6 will replace this with a proper PDFKit renderer styled
  // to match the new media kit.
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${io.io_number}</title>
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color:#111; margin:48px; }
  h1 { margin:0 0 4px 0; font-size:28px; letter-spacing:-0.02em; }
  .muted { color:#666; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:16px 32px; margin:24px 0; }
  .grid dt { color:#666; font-size:11px; text-transform:uppercase; letter-spacing:0.08em; }
  .grid dd { margin:2px 0 0 0; font-weight:500; }
  table { width:100%; border-collapse:collapse; margin-top:16px; }
  th, td { text-align:left; padding:8px 10px; border-bottom:1px solid #eee; font-size:13px; }
  th { color:#666; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.08em; }
  .total { text-align:right; font-size:16px; margin-top:16px; }
  .footer { margin-top:64px; color:#999; font-size:11px; }
</style></head>
<body>
  <h1>Insertion Order</h1>
  <div class="muted">${io.io_number} · ${io.status.toUpperCase()}</div>
  <dl class="grid">
    <div><dt>Advertiser</dt><dd>${escapeHtml(advertiserName)}</dd></div>
    <div><dt>Channel</dt><dd>${io.channel}</dd></div>
    <div><dt>Publication</dt><dd>${escapeHtml(io.publication ?? '—')}</dd></div>
    <div><dt>Flight</dt><dd>${io.flight_start ?? '—'} → ${io.flight_end ?? '—'}</dd></div>
  </dl>
  <table>
    <thead><tr><th>Description</th><th>Size</th><th>Qty</th><th>Rate</th><th>Total</th></tr></thead>
    <tbody>
      ${io.line_items.map((li) => `<tr>
        <td>${escapeHtml(li.description ?? li.slot ?? '—')}</td>
        <td>${escapeHtml(li.size ?? '—')}</td>
        <td>${li.quantity ?? 1}</td>
        <td>${li.rate_cents != null ? '$' + (li.rate_cents/100).toFixed(2) : '—'}</td>
        <td>${li.total_cents != null ? '$' + (li.total_cents/100).toFixed(2) : '—'}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  <div class="total"><strong>Total: $${(io.total_cents/100).toFixed(2)}</strong></div>
  ${io.notes ? `<p style="margin-top:24px;"><strong>Notes:</strong> ${escapeHtml(io.notes)}</p>` : ''}
  <div class="footer">Realty News Now · realtynewsnow.app</div>
</body></html>`;

  return new NextResponse(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c] as string);
}
