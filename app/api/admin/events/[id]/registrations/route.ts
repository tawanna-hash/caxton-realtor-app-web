import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema, getSql } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import { sendEmail } from '@/lib/email';
import { escapeHtml } from '@/lib/server/email/html';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

type Registration = {
  id: number;
  full_name: string;
  company: string;
  is_realtor: boolean;
  license_number: string | null;
  email: string;
  mobile: string;
  registered_at: string;
  notification_sent_at: string | null;
};

const emailSchema = z.object({
  recipient: z.string().trim().email().max(320),
});

function csvCell(value: string | number | boolean | null): string {
  const text = value === null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function buildCsv(rows: Registration[]): string {
  const header = [
    'Name',
    'Company',
    'REALTOR',
    'License Number',
    'Email',
    'Mobile',
    'Registered At',
  ].map(csvCell);
  const body = rows.map((row) =>
    [
      row.full_name,
      row.company,
      row.is_realtor ? 'Yes' : 'No',
      row.license_number,
      row.email,
      row.mobile,
      row.registered_at,
    ].map(csvCell).join(','),
  );
  return [header.join(','), ...body].join('\r\n');
}

async function loadRegistry(id: number) {
  await ensureSchema();
  const sql = getSql();
  const events = (await sql`
    SELECT id, title, start_date, organizer, organizer_email
      FROM events
     WHERE id = ${id}
     LIMIT 1
  `) as unknown as Array<{
    id: number;
    title: string;
    start_date: string | null;
    organizer: string | null;
    organizer_email: string | null;
  }>;
  if (!events[0]) return null;
  const registrations = (await sql`
    SELECT id, full_name, company, is_realtor, license_number, email, mobile,
           registered_at, notification_sent_at
      FROM event_registrations
     WHERE event_id = ${id}
     ORDER BY registered_at DESC
  `) as unknown as Registration[];
  return { event: events[0], registrations };
}

export async function GET(_req: Request, ctx: Ctx) {
  await requireAdmin();
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid event.' }, { status: 400 });
  }
  const registry = await loadRegistry(id);
  if (!registry) return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  return NextResponse.json({
    ok: true,
    event: registry.event,
    registrations: registry.registrations,
  });
}

export async function POST(req: Request, ctx: Ctx) {
  await requireAdmin();
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid event.' }, { status: 400 });
  }
  const parsed = emailSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid partner email address.' }, { status: 400 });
  }
  const registry = await loadRegistry(id);
  if (!registry) return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  if (registry.registrations.length === 0) {
    return NextResponse.json({ error: 'There are no attendees to email.' }, { status: 409 });
  }

  const rows = registry.registrations.map((r) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(r.full_name)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(r.company)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${r.is_realtor ? 'Yes' : 'No'}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(r.license_number || '—')}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(r.email)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(r.mobile)}</td>
    </tr>`).join('');
  const csv = buildCsv(registry.registrations);
  const safeFilename = registry.event.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || `event-${id}`;
  const result = await sendEmail({
    to: parsed.data.recipient,
    subject: `Attendee registry — ${registry.event.title}`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:760px;margin:0 auto;padding:24px;">
        <h1 style="margin:0;color:#301D5D;font-size:24px;">Attendee registry</h1>
        <h2 style="margin:8px 0 6px;color:#111827;font-size:18px;">${escapeHtml(registry.event.title)}</h2>
        <p style="margin:0 0 20px;color:#6b7280;">${registry.registrations.length} registered attendee${registry.registrations.length === 1 ? '' : 's'}</p>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr style="background:#f3f4f6;text-align:left;">
              <th style="padding:8px;">Name</th><th style="padding:8px;">Company</th>
              <th style="padding:8px;">REALTOR</th><th style="padding:8px;">License</th>
              <th style="padding:8px;">Email</th><th style="padding:8px;">Mobile</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <p style="margin:20px 0 0;color:#9ca3af;font-size:12px;">A CSV copy is attached.</p>
      </div>`,
    attachments: [{
      filename: `${safeFilename}-attendees.csv`,
      content: Buffer.from(csv, 'utf8').toString('base64'),
      contentType: 'text/csv; charset=utf-8',
    }],
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'Email failed.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, messageId: result.messageId });
}
