import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import { getGmailClient } from '@/lib/server/gmail-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SENDER = 'support@fastemail.email';
type Details = { agentName: string | null; company: string | null; businessAddress: string | null; email: string | null; website: string | null; phone: string | null };

async function setup() {
  await ensureSchema();
  const sql = getSql();
  await sql`CREATE TABLE IF NOT EXISTS fastemail_realtor_imports (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), gmail_message_id TEXT NOT NULL UNIQUE, received_at TIMESTAMPTZ NOT NULL, agent_name TEXT, company TEXT, business_address TEXT, email TEXT, website TEXT, phone TEXT, status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','realtyline','san_antonio','rejected')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), reviewed_at TIMESTAMPTZ)`;
  await sql`CREATE INDEX IF NOT EXISTS fastemail_realtor_imports_status_idx ON fastemail_realtor_imports(status, received_at DESC)`;
}

function decode(v?: string | null) { return v ? Buffer.from(v, 'base64url').toString('utf8') : ''; }
function htmlToLines(html: string) {
  return html
    .replace(/<(?:br|\/p|\/div|\/tr|\/li|\/table|\/h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}
// Minimal shape of a Gmail message payload part we walk. Only the fields we read.
// Google's Schema$Message uses `string | null | undefined` for optional strings,
// so we mirror that here to avoid casting at every call site.
interface GmailPart {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: GmailPart[] | null;
}
interface GmailMessage {
  payload?: GmailPart | null;
}

function body(message: GmailMessage) {
  const plain: string[] = []; const html: string[] = [];
  const visit = (part: GmailPart | null | undefined) => {
    if (!part) return;
    const value = decode(part.body?.data ?? undefined);
    if (value) {
      if ((part.mimeType || '').toLowerCase() === 'text/html') html.push(value);
      else if ((part.mimeType || '').toLowerCase() === 'text/plain') plain.push(value);
    }
    for (const child of part.parts || []) visit(child);
  };
  visit(message.payload);
  return html.length ? htmlToLines(html.join('\n')) : plain.join('\n');
}
function clean(value: string | null | undefined) { const text = value?.replace(/[ \t]+/g, ' ').trim(); return text || null; }
function isJunk(line: string) { return /^(map this property|link to|virtual tour|information deemed|instant removal|this property listing|fast email flyers)/i.test(line); }
function extract(raw: string): Details {
  const disclaimer = raw.search(/Information deemed reliable|INSTANT REMOVAL LINK|This property listing was sent/i);
  const beforeDisclaimer = disclaimer >= 0 ? raw.slice(0, disclaimer) : raw;
  const lines = beforeDisclaimer.split(/\r?\n/).map(clean).filter((v): v is string => Boolean(v)).filter((v) => !isJunk(v));
  const emailIndexes = lines.map((line, i) => /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(line) ? i : -1).filter((i) => i >= 0);
  const emailIndex = emailIndexes.at(-1) ?? -1;
  const email = emailIndex >= 0 ? lines[emailIndex].match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null : null;
  const signature = lines.slice(Math.max(0, emailIndex - 8), Math.min(lines.length, emailIndex + 3));
  const addressIndex = signature.findIndex((line) => /\b(?:TX|Texas)\s+\d{5}(?:-\d{4})?\b/i.test(line));
  const addressLines = addressIndex >= 0 ? signature.slice(Math.max(0, addressIndex - 1), addressIndex + 1) : [];
  const businessAddress = addressLines.length ? addressLines.join('\n') : null;
  const nameIndex = signature.findIndex((line) => /\b(REALTOR|Broker|Associate)\b/i.test(line));
  const nameLine = nameIndex >= 0 ? signature[nameIndex] : null;
  const agentName = clean(nameLine?.replace(/,?\s*(REALTOR®?|Broker(?:\/Owners?)?|Associate|ABR|CRB|CRS|GRI|SRS|RENE|CLHMS|RSPS|Luxury Specialist|Accredited Staging Professional).*/gi, '') ?? null);
  const companyCandidates = signature.slice(Math.max(0, nameIndex + 1), Math.max(0, addressIndex)).filter((line) => !/\b\d{1,6}\b/.test(line));
  const company = clean(companyCandidates.at(-1) ?? null);
  const website = signature.map((line) => line.match(/(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\.[a-z]{2,}(?:\/[^\s]*)?/i)?.[0] ?? null).find((v) => v && !v.includes('fastemail')) ?? null;
  const phone = signature.map((line) => line.match(/(?:\+1[ .-]?)?(?:\(?\d{3}\)?[ .-]?)\d{3}[ .-]\d{4}/)?.[0] ?? null).find(Boolean) ?? null;
  return { agentName, company, businessAddress, email, website: clean(website), phone: clean(phone) };
}

export async function GET(req: NextRequest) {
  await requireAdmin(); await setup();
  const status = new URL(req.url).searchParams.get('status') || 'pending'; const sql = getSql();
  const rows = status === 'all' ? await sql`SELECT * FROM fastemail_realtor_imports ORDER BY received_at DESC` : await sql`SELECT * FROM fastemail_realtor_imports WHERE status = ${status} ORDER BY received_at DESC`;
  const countRows = await sql`SELECT status, count(*)::int AS count FROM fastemail_realtor_imports GROUP BY status` as unknown as Array<{status: string; count: number}>;
  return NextResponse.json({ rows, counts: Object.fromEntries(countRows.map((r) => [r.status, r.count])) });
}

export async function POST() {
  await requireAdmin(); await setup();
  const client = await getGmailClient();
  if (!client) return NextResponse.json({ error: 'Connect Gmail before scanning.' }, { status: 400 });
  const sql = getSql();
  const listed = await client.gmail.users.messages.list({ userId: 'me', q: `from:${SENDER}`, maxResults: 100 });
  let queued = 0, repaired = 0, skipped = 0;
  for (const item of listed.data.messages || []) {
    if (!item.id) continue;
    const known = await sql`SELECT id, status FROM fastemail_realtor_imports WHERE gmail_message_id = ${item.id} LIMIT 1` as unknown as Array<{ id: string; status: string }>;
    if (known[0] && known[0].status !== 'pending') { skipped++; continue; }
    const message = await client.gmail.users.messages.get({ userId: 'me', id: item.id, format: 'full' });
    const d = extract(body(message.data));
    if (!d.agentName && !d.email) { skipped++; continue; }
    const received = message.data.internalDate ? new Date(Number(message.data.internalDate)) : new Date();
    if (known[0]) {
      await sql`UPDATE fastemail_realtor_imports SET received_at = ${received}, agent_name = ${d.agentName}, company = ${d.company}, business_address = ${d.businessAddress}, email = ${d.email}, website = ${d.website}, phone = ${d.phone} WHERE id = ${known[0].id}`;
      repaired++;
    } else {
      await sql`INSERT INTO fastemail_realtor_imports (gmail_message_id, received_at, agent_name, company, business_address, email, website, phone) VALUES (${item.id}, ${received}, ${d.agentName}, ${d.company}, ${d.businessAddress}, ${d.email}, ${d.website}, ${d.phone})`;
      queued++;
    }
  }
  return NextResponse.json({ queued, repaired, skipped });
}

export async function PATCH(req: NextRequest) {
  await requireAdmin(); await setup();
  const { id, action } = await req.json() as { id?: string; action?: 'realtyline' | 'san_antonio' | 'reject' };
  if (!id || !['realtyline','san_antonio','reject'].includes(action || '')) return NextResponse.json({ error: 'A valid record and action are required.' }, { status: 400 });
  const sql = getSql(); const found = await sql`SELECT * FROM fastemail_realtor_imports WHERE id = ${id} LIMIT 1` as unknown as Record<string, unknown>[]; const row = found[0] as Record<string, string | null | undefined> | undefined;
  if (!row) return NextResponse.json({ error: 'Record not found.' }, { status: 404 });
  if (action === 'reject') { await sql`UPDATE fastemail_realtor_imports SET status = 'rejected', reviewed_at = NOW() WHERE id = ${id}`; return NextResponse.json({ ok: true }); }
  const segment = action === 'realtyline' ? 'realtyline-atx-print' : 'newsline-sa-print';
  const exists = row.email ? await sql`SELECT id FROM mailing_contacts WHERE lower(email) = lower(${row.email}) LIMIT 1` : [];
  const duplicate = (exists as unknown[]).length > 0;
  if (!duplicate) {
    const name = String(row.agent_name || '').trim().split(/\s+/);
    await sql`INSERT INTO mailing_contacts (segment, first_name, last_name, email, phone, company, address, website, source, tags) VALUES (${segment}, ${name[0] || '(no name)'}, ${name.slice(1).join(' ') || null}, ${row.email}, ${row.phone}, ${row.company}, ${row.business_address}, ${row.website}, 'fastemail', ${JSON.stringify(['REALTOR','fastemail'])}::jsonb)`;
  }
  await sql`UPDATE fastemail_realtor_imports SET status = ${action}, reviewed_at = NOW() WHERE id = ${id}`;
  return NextResponse.json({ ok: true, duplicate });
}
