import { NextResponse, type NextRequest } from 'next/server';
import { generateInvoiceHistoryPdf } from '@/lib/invoice-history-pdf';
import { loadInvoiceHistory, historyDay } from '@/lib/server/invoice-history';
import { verifyInvoiceHistoryToken } from '@/lib/server/invoice-history-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const id = verifyInvoiceHistoryToken(decodeURIComponent(token));
  if (id == null) return new NextResponse('Not found', { status: 404 });
  const h = await loadInvoiceHistory(id);
  if (!h) return new NextResponse('Not found', { status: 404 });
  const bytes = await generateInvoiceHistoryPdf(h, historyDay(new Date(), 'America/Chicago'));
  const file = `Invoice-History-${h.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${file}"`, 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  });
}
