import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { getCheckPayments } from '@/lib/server/deposit-reports';
import { generateDepositSlipPdf } from '@/lib/server/deposit-slip-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const from = req.nextUrl.searchParams.get('from') ?? '';
  const to = req.nextUrl.searchParams.get('to') ?? '';
  const kind = req.nextUrl.searchParams.get('kind') === 'detail' ? 'detail' : 'slip';
  if (!datePattern.test(from) || !datePattern.test(to) || from > to) {
    return NextResponse.json({ error: 'Choose a valid date range.' }, { status: 400 });
  }
  const rows = await getCheckPayments(from, to);
  if (rows.length > 3000) return NextResponse.json({ error: 'Narrow the date range to 3,000 checks or fewer.' }, { status: 400 });
  const pdf = generateDepositSlipPdf(rows, from, to, admin.email ?? null, kind);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${kind === 'detail' ? 'deposit-detail' : 'deposit-slip'}-${from}-${to}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
