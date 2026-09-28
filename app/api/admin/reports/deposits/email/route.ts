import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { getCheckPayments } from '@/lib/server/deposit-reports';
import { generateDepositSlipPdf } from '@/lib/server/deposit-slip-pdf';
import { sendEmail } from '@/lib/email';
import { escapeHtml, wrapEmail } from '@/lib/server/email/html';
import { formatCents } from '@/lib/invoices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const inputSchema = z.object({
  recipient: z.email().max(320),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = inputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.from > parsed.data.to) {
    return NextResponse.json({ error: 'Enter a valid recipient and date range.' }, { status: 400 });
  }
  const { recipient, from, to } = parsed.data;
  const rows = await getCheckPayments(from, to);
  if (rows.length > 3000) return NextResponse.json({ error: 'Narrow the date range to 3,000 checks or fewer.' }, { status: 400 });
  const total = rows.reduce((sum, row) => sum + row.amount_cents, 0);
  const pdf = generateDepositSlipPdf(rows, from, to, admin.email ?? null);
  const result = await sendEmail({
    to: recipient,
    subject: `Deposit Slip · ${from} to ${to}`,
    html: wrapEmail({
      heading: 'Deposit Slip',
      signature: false,
      bodyHtml: `<p>Attached is the check deposit slip for ${escapeHtml(from)} through ${escapeHtml(to)}.</p><p><strong>${rows.length} checks · ${escapeHtml(formatCents(total))}</strong></p><p>Prepared by ${escapeHtml(admin.email ?? 'Caxton Publications, Inc.')}.</p>`,
    }),
    attachments: [{ filename: `deposit-slip-${from}-${to}.pdf`, content: pdf.toString('base64'), contentType: 'application/pdf' }],
  });
  if (!result.ok) return NextResponse.json({ error: 'The email could not be sent. Please try again.' }, { status: 502 });
  return NextResponse.json({ ok: true, recipient, messageId: result.messageId ?? null });
}
