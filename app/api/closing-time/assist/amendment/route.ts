import { PDFDocument } from 'pdf-lib';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { dealRisks } from '@/lib/closing-time-risks';
import { requireDeal } from '@/lib/server/closing-time-assist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const chicagoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const pretty = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };

/**
 * Pre-fills TREC 39-11 (Amendment to Contract) from the deal so the agent can
 * review and send it for signatures. Fills only the property, one change
 * (a deadline extension in "Other Modifications", or a new closing date), and
 * leaves every signature and the date of final acceptance blank.
 */
export const GET = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  const url = new URL(req.url);
  const dealId = url.searchParams.get('dealId') ?? '';
  const deal = await requireDeal(user.realtorId, dealId);
  const type = url.searchParams.get('type') === 'closing' ? 'closing' : 'deadline';

  const template = await fetch(new URL('/forms/trec-library/trec-39-11.pdf', url.origin));
  if (!template.ok) return new Response('Form unavailable', { status: 502 });
  const pdf = await PDFDocument.load(await template.arrayBuffer());
  const form = pdf.getForm();
  const text = (name: string, value: string) => { try { form.getTextField(name).setText(value); } catch { /* field missing in this form version */ } };
  const check = (name: string) => { try { form.getCheckBox(name).check(); } catch { /* ignore */ } };

  text('Street Address and City', deal.propertyAddress || deal.title);

  if (type === 'closing') {
    const newDate = url.searchParams.get('newDate') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return new Response('Enter a valid new closing date.', { status: 400 });
    check('3 The date in Paragraph 9 of the contract is changed to');
    text('date 5', `${MONTHS[Number(newDate.slice(5, 7)) - 1]} ${Number(newDate.slice(8, 10))}`);
    text('20_25', newDate.slice(2, 4));
  } else {
    const risk = dealRisks(deal, chicagoToday()).find((r) => r.id === url.searchParams.get('riskId'));
    if (!risk?.deadlineLabel || !risk.deadlineDate) return new Response('That deadline no longer applies.', { status: 404 });
    const days = Math.min(30, Math.max(1, Number.parseInt(url.searchParams.get('days') ?? '3', 10) || 3));
    const next = addDays(risk.deadlineDate, days);
    check('10');
    text('Text5.1', `The ${risk.deadlineLabel.toLowerCase()} is extended from ${pretty(risk.deadlineDate)} to ${pretty(next)}.`);
    text('Text4.1', 'All other terms of the contract remain unchanged.');
  }

  const bytes = await pdf.save();
  return new Response(new Uint8Array(bytes), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="TREC-39-11-amendment-draft.pdf"', 'Cache-Control': 'private, no-store' },
  });
});
