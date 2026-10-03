import { createHash, randomBytes, randomUUID } from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { query } from '@/lib/server/db/neon';
import { sendEmail } from '@/lib/email';
import { ensureAssistSchema, getUpload, requireDeal } from '@/lib/server/closing-time-assist';

export type SignField = { id: string; signer: number; type: 'signature' | 'date'; page: number; x: number; y: number; w: number; h: number };
export type SignerInput = { name: string; email: string };
type EventRow = { at: string; who: string; event: string; ip?: string };

const MAX_BYTES = 3 * 1024 * 1024;
const EXPIRE_DAYS = 30;
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
const mail = (text: string, link?: { href: string; label: string }) => `<div style="font-family:Arial,sans-serif;color:#1e293b;line-height:1.55;max-width:600px">${esc(text).replace(/\n/g, '<br>')}${link ? `<p style="margin:24px 0"><a href="${link.href}" style="background:#301D5D;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">${esc(link.label)}</a></p>` : ''}</div>`;

let ready: Promise<void> | null = null;
function ensure(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    await ensureAssistSchema();
    await query(`CREATE TABLE IF NOT EXISTS closing_time_sign_requests (
      id UUID PRIMARY KEY, realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE, deal_id TEXT NOT NULL,
      document TEXT NOT NULL, property TEXT NOT NULL DEFAULT '', agent_name TEXT NOT NULL DEFAULT '', agent_email TEXT NOT NULL DEFAULT '',
      fields JSONB NOT NULL DEFAULT '[]', original_b64 TEXT NOT NULL, original_sha TEXT NOT NULL, signed_b64 TEXT, signed_sha TEXT,
      status TEXT NOT NULL DEFAULT 'sent', events JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL, completed_at TIMESTAMPTZ)`);
    await query(`CREATE TABLE IF NOT EXISTS closing_time_sign_signers (
      id UUID PRIMARY KEY, request_id UUID NOT NULL REFERENCES closing_time_sign_requests(id) ON DELETE CASCADE, idx INT NOT NULL,
      name TEXT NOT NULL, email TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'pending',
      consent_at TIMESTAMPTZ, signed_at TIMESTAMPTZ, ip TEXT, user_agent TEXT, marks JSONB NOT NULL DEFAULT '{}', decline_reason TEXT)`);
    await query(`CREATE INDEX IF NOT EXISTS closing_time_sign_signers_req_idx ON closing_time_sign_signers (request_id)`);
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

const clamp = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

/** Appends a clean signature page and returns fields placed on it. */
async function withSignaturePage(pdf: PDFDocument, signers: SignerInput[], title: string): Promise<SignField[]> {
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([612, 792]);
  const pageIdx = pdf.getPageCount() - 1;
  page.drawText('Signature Page', { x: 72, y: 720, size: 18, font: bold, color: rgb(0.13, 0.1, 0.25) });
  page.drawText(title.slice(0, 90), { x: 72, y: 698, size: 10, font, color: rgb(0.35, 0.35, 0.4) });
  const fields: SignField[] = [];
  signers.forEach((s, i) => {
    const top = 640 - i * 100;
    page.drawLine({ start: { x: 72, y: top - 40 }, end: { x: 340, y: top - 40 }, thickness: 0.8, color: rgb(0.2, 0.2, 0.25) });
    page.drawText(s.name, { x: 72, y: top - 56, size: 10, font: bold, color: rgb(0.1, 0.1, 0.15) });
    page.drawLine({ start: { x: 380, y: top - 40 }, end: { x: 540, y: top - 40 }, thickness: 0.8, color: rgb(0.2, 0.2, 0.25) });
    page.drawText('Date', { x: 380, y: top - 56, size: 9, font, color: rgb(0.35, 0.35, 0.4) });
    const yTop = (792 - (top - 38)) / 792;
    fields.push({ id: randomUUID(), signer: i, type: 'signature', page: pageIdx, x: 72 / 612, y: yTop - 44 / 792, w: 268 / 612, h: 42 / 792 });
    fields.push({ id: randomUUID(), signer: i, type: 'date', page: pageIdx, x: 380 / 612, y: yTop - 22 / 792, w: 160 / 612, h: 20 / 792 });
  });
  return fields;
}

export type BuiltinInput = {
  dealId: string; uploadId?: string; fileName?: string; fileB64?: string; subject?: string;
  signers: SignerInput[]; placement: 'page' | 'inline'; fields?: SignField[]; origin: string;
};

export async function createSignRequest(realtorId: string, input: BuiltinInput): Promise<string> {
  await ensure();
  const deal = await requireDeal(realtorId, input.dealId);
  let raw: Buffer; let name: string;
  if (input.uploadId) {
    const f = await getUpload(realtorId, input.uploadId);
    if (!f) throw new Error('File not found.');
    raw = f.bytes; name = f.filename;
  } else if (input.fileB64 && input.fileName) { raw = Buffer.from(input.fileB64, 'base64'); name = input.fileName; }
  else throw new Error('Choose a PDF to send.');
  if (raw.length > MAX_BYTES) throw new Error('That file is over 3 MB. Send a smaller PDF.');
  let pdf: PDFDocument;
  try { pdf = await PDFDocument.load(raw, { ignoreEncryption: true }); } catch { throw new Error('Only PDF files can be sent for signature.'); }
  const property = deal.propertyAddress || deal.title || 'Deal';
  const docName = name.replace(/\.pdf$/i, '').slice(0, 120) || 'Document';
  let fields: SignField[];
  if (input.placement === 'inline') {
    const pages = pdf.getPageCount();
    fields = (input.fields ?? []).filter((f) => f.signer >= 0 && f.signer < input.signers.length && f.page >= 0 && f.page < pages).slice(0, 80).map((f) => ({ id: randomUUID(), signer: f.signer, type: f.type === 'date' ? 'date' : 'signature', page: f.page, x: clamp(f.x), y: clamp(f.y), w: Math.min(0.9, Math.max(0.04, clamp(f.w))), h: Math.min(0.5, Math.max(0.015, clamp(f.h))) }));
    input.signers.forEach((s, i) => { if (!fields.some((f) => f.signer === i && f.type === 'signature')) throw new Error(`Place a signature field for ${s.name}.`); });
  } else fields = await withSignaturePage(pdf, input.signers, `${docName} - ${property}`);
  const bytes = Buffer.from(await pdf.save());
  const me = await query<{ first_name: string | null; last_name: string | null; email: string }>(`SELECT first_name, last_name, email FROM realtors WHERE id=$1`, [realtorId]);
  const agentName = [me[0]?.first_name, me[0]?.last_name].filter(Boolean).join(' ') || 'Your agent';
  const reqId = randomUUID();
  await query(`INSERT INTO closing_time_sign_requests (id, realtor_id, deal_id, document, property, agent_name, agent_email, fields, original_b64, original_sha, events, expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::jsonb, NOW() + INTERVAL '${EXPIRE_DAYS} days')`,
    [reqId, realtorId, input.dealId, docName, property, agentName, me[0]?.email ?? '', JSON.stringify(fields), bytes.toString('base64'), sha(bytes), JSON.stringify([{ at: new Date().toISOString(), who: agentName, event: 'Sent for signature' }])]);
  const links: { to: SignerInput; token: string }[] = [];
  for (let i = 0; i < input.signers.length; i += 1) {
    const token = randomBytes(32).toString('base64url');
    await query(`INSERT INTO closing_time_sign_signers (id, request_id, idx, name, email, token_hash) VALUES ($1,$2,$3,$4,$5,$6)`, [randomUUID(), reqId, i, input.signers[i].name, input.signers[i].email, sha(token)]);
    links.push({ to: input.signers[i], token });
  }
  await query(`INSERT INTO closing_time_envelopes (id, realtor_id, deal_id, provider, external_id, document, signers) VALUES ($1,$2,$3,'builtin',$4,$5,$6::jsonb)`, [randomUUID(), realtorId, input.dealId, reqId, docName, JSON.stringify(input.signers)]);
  const subject = (input.subject?.trim() || `Please sign: ${docName} - ${property}`).slice(0, 200);
  const failed: string[] = [];
  await Promise.all(links.map(async ({ to, token }) => {
    const r = await sendEmail({ to: to.email, replyTo: me[0]?.email || undefined, subject, html: mail(`Hello ${to.name},\n\n${agentName} has sent you "${docName}" for ${property} to review and sign electronically.\n\nThe link is private to you and expires in ${EXPIRE_DAYS} days.`, { href: `${input.origin}/sign/${token}`, label: 'Review And Sign' }) });
    if (!r.ok) failed.push(to.email);
  }));
  if (failed.length === links.length) { await query(`UPDATE closing_time_sign_requests SET status='cancelled' WHERE id=$1`, [reqId]); await query(`UPDATE closing_time_envelopes SET status='cancelled' WHERE external_id=$1`, [reqId]); throw new Error('The signing emails could not be sent. Try again.'); }
  return `Sent "${docName}" for secure signature to ${input.signers.map((s) => s.email).join(', ')}.${failed.length ? ` These emails failed: ${failed.join(', ')}.` : ''}`;
}

type Row = { id: string; realtor_id: string; deal_id: string; document: string; property: string; agent_name: string; agent_email: string; fields: SignField[]; original_b64: string; original_sha: string; signed_b64: string | null; signed_sha: string | null; status: string; events: EventRow[]; expires_at: Date; created_at: Date };
type SignerRow = { id: string; request_id: string; idx: number; name: string; email: string; status: string; consent_at: Date | null; signed_at: Date | null; ip: string | null; marks: Record<string, { kind: 'typed' | 'drawn'; value: string }>; decline_reason: string | null };

async function byToken(token: string): Promise<{ req: Row; me: SignerRow; all: SignerRow[] } | null> {
  await ensure();
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return null;
  const me = (await query<SignerRow>(`SELECT * FROM closing_time_sign_signers WHERE token_hash=$1`, [sha(token)]))[0];
  if (!me) return null;
  const req = (await query<Row>(`SELECT * FROM closing_time_sign_requests WHERE id=$1`, [me.request_id]))[0];
  if (!req) return null;
  const all = await query<SignerRow>(`SELECT * FROM closing_time_sign_signers WHERE request_id=$1 ORDER BY idx`, [req.id]);
  return { req, me, all };
}

const expired = (r: Row) => r.status === 'sent' && new Date(r.expires_at).getTime() < Date.now();

export async function getSignView(token: string) {
  const f = await byToken(token);
  if (!f) return null;
  const { req, me, all } = f;
  const state = req.status === 'completed' ? 'completed' : req.status === 'declined' ? 'declined' : req.status === 'cancelled' ? 'cancelled' : expired(req) ? 'expired' : me.status === 'signed' ? 'waiting' : me.status === 'declined' ? 'declined' : 'ready';
  return {
    state, document: req.document, property: req.property, agentName: req.agent_name, signerName: me.name,
    fields: req.fields.filter((x) => x.signer === me.idx), signedBy: all.filter((s) => s.status === 'signed').length, total: all.length,
    fingerprint: req.original_sha,
  };
}

export async function getSignPdf(token: string): Promise<{ bytes: Buffer; name: string } | null> {
  const f = await byToken(token);
  if (!f) return null;
  const done = f.req.status === 'completed' && f.req.signed_b64;
  return { bytes: Buffer.from(done ? f.req.signed_b64! : f.req.original_b64, 'base64'), name: `${f.req.document}${done ? ' - signed' : ''}.pdf` };
}

async function addEvent(reqId: string, ev: EventRow) {
  await query(`UPDATE closing_time_sign_requests SET events = events || $2::jsonb WHERE id=$1`, [reqId, JSON.stringify([ev])]);
}

export async function submitSignature(token: string, body: { consent: boolean; marks: Record<string, { kind: 'typed' | 'drawn'; value: string }> }, ctx: { ip: string; ua: string }): Promise<{ ok: true; completed: boolean } | { ok: false; error: string }> {
  const f = await byToken(token);
  if (!f) return { ok: false, error: 'This link is not valid.' };
  const { req, me } = f;
  if (req.status !== 'sent' || expired(req)) return { ok: false, error: 'This document can no longer be signed.' };
  if (me.status !== 'pending') return { ok: false, error: 'You have already responded.' };
  if (!body.consent) return { ok: false, error: 'You must agree to sign electronically.' };
  const mine = req.fields.filter((x) => x.signer === me.idx);
  const marks: Record<string, { kind: 'typed' | 'drawn'; value: string }> = {};
  for (const fld of mine.filter((x) => x.type === 'signature')) {
    const m = body.marks[fld.id];
    if (!m || (m.kind !== 'typed' && m.kind !== 'drawn') || typeof m.value !== 'string') return { ok: false, error: 'Please sign every signature box.' };
    if (m.kind === 'typed' && (m.value.trim().length < 2 || m.value.length > 80)) return { ok: false, error: 'Type your full name to sign.' };
    if (m.kind === 'drawn' && (!m.value.startsWith('data:image/png;base64,') || m.value.length > 300_000)) return { ok: false, error: 'That drawn signature could not be used.' };
    marks[fld.id] = { kind: m.kind, value: m.kind === 'typed' ? m.value.trim() : m.value };
  }
  const claimed = await query<{ id: string }>(`UPDATE closing_time_sign_signers SET status='signed', consent_at=NOW(), signed_at=NOW(), ip=$2, user_agent=$3, marks=$4::jsonb WHERE id=$1 AND status='pending' RETURNING id`, [me.id, ctx.ip, ctx.ua.slice(0, 300), JSON.stringify(marks)]);
  if (!claimed[0]) return { ok: false, error: 'You have already responded.' };
  await addEvent(req.id, { at: new Date().toISOString(), who: `${me.name} <${me.email}>`, event: 'Agreed to sign electronically and signed', ip: ctx.ip });
  const remaining = await query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM closing_time_sign_signers WHERE request_id=$1 AND status<>'signed'`, [req.id]);
  if ((remaining[0]?.n ?? 1) === 0) { await finalize(req.id); return { ok: true, completed: true }; }
  return { ok: true, completed: false };
}

export async function declineSignature(token: string, reason: string, ctx: { ip: string }): Promise<{ ok: boolean; error?: string }> {
  const f = await byToken(token);
  if (!f) return { ok: false, error: 'This link is not valid.' };
  const { req, me } = f;
  if (req.status !== 'sent' || me.status !== 'pending') return { ok: false, error: 'This document can no longer be declined.' };
  await query(`UPDATE closing_time_sign_signers SET status='declined', decline_reason=$2 WHERE id=$1`, [me.id, reason.slice(0, 500)]);
  await query(`UPDATE closing_time_sign_requests SET status='declined' WHERE id=$1`, [req.id]);
  await query(`UPDATE closing_time_envelopes SET status='declined', updated_at=NOW() WHERE external_id=$1`, [req.id]);
  await addEvent(req.id, { at: new Date().toISOString(), who: `${me.name} <${me.email}>`, event: 'Declined to sign', ip: ctx.ip });
  if (req.agent_email) void sendEmail({ to: req.agent_email, subject: `Declined: ${req.document} - ${req.property}`, html: mail(`${me.name} (${me.email}) declined to sign "${req.document}" for ${req.property}.${reason ? `\n\nReason: ${reason.slice(0, 500)}` : ''}`) });
  return { ok: true };
}

async function finalize(reqId: string): Promise<void> {
  const req = (await query<Row>(`SELECT * FROM closing_time_sign_requests WHERE id=$1`, [reqId]))[0];
  const signers = await query<SignerRow>(`SELECT * FROM closing_time_sign_signers WHERE request_id=$1 ORDER BY idx`, [reqId]);
  const pdf = await PDFDocument.load(Buffer.from(req.original_b64, 'base64'));
  const script = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();
  for (const fld of req.fields) {
    const s = signers[fld.signer];
    const page = pages[fld.page];
    if (!s || !page) continue;
    const { width, height } = page.getSize();
    const x = fld.x * width; const w = fld.w * width; const h = fld.h * height; const yBottom = height - (fld.y + fld.h) * height;
    if (fld.type === 'date') {
      const text = s.signed_at ? new Date(s.signed_at).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: '2-digit', day: '2-digit', year: 'numeric' }) : '';
      page.drawText(text, { x: x + 2, y: yBottom + Math.max(2, h / 2 - 5), size: Math.min(11, h * 0.7), font, color: rgb(0.1, 0.1, 0.15) });
      continue;
    }
    const m = s.marks[fld.id];
    if (!m) continue;
    if (m.kind === 'drawn') {
      const img = await pdf.embedPng(Buffer.from(m.value.slice(m.value.indexOf(',') + 1), 'base64'));
      const scale = Math.min(w / img.width, h / img.height);
      page.drawImage(img, { x, y: yBottom, width: img.width * scale, height: img.height * scale });
    } else {
      const size = Math.min(26, h * 0.7);
      page.drawText(m.value, { x: x + 2, y: yBottom + h * 0.2, size, font: script, color: rgb(0.05, 0.1, 0.35), maxWidth: w });
    }
  }
  const cert = pdf.addPage([612, 792]);
  let y = 730;
  cert.drawText('Certificate Of Electronic Signature', { x: 54, y, size: 16, font: bold, color: rgb(0.13, 0.1, 0.25) }); y -= 24;
  const line = (t: string, b = false, size = 9.5) => { cert.drawText(t.slice(0, 105), { x: 54, y, size, font: b ? bold : font, color: rgb(0.15, 0.15, 0.2) }); y -= size + 6; };
  line(`Document: ${req.document}`, true, 10.5); line(`Property: ${req.property}`); line(`Sent by: ${req.agent_name}`); line(`Request ID: ${req.id}`);
  line(`Fingerprint (SHA-256) of the document before signing:`); line(req.original_sha, false, 8); y -= 6;
  line('Signers', true, 11);
  for (const s of signers) {
    line(`${s.name} <${s.email}>`, true);
    line(`Signed ${s.signed_at ? new Date(s.signed_at).toISOString() : ''}  ·  IP ${s.ip ?? 'unknown'}`);
    line('Agreed to use electronic records and signatures before signing.'); y -= 4;
  }
  y -= 4; line('History', true, 11);
  const events = (await query<{ events: EventRow[] }>(`SELECT events FROM closing_time_sign_requests WHERE id=$1`, [reqId]))[0].events;
  for (const e of events.slice(-18)) line(`${e.at}  ${e.who}: ${e.event}${e.ip ? ` (${e.ip})` : ''}`, false, 8);
  y -= 8;
  line('Each signer agreed to sign electronically under the federal ESIGN Act and the Texas Uniform Electronic Transactions Act.', false, 8);
  line('Changing this file after completion will no longer match the fingerprint recorded in the signing system.', false, 8);
  const out = Buffer.from(await pdf.save());
  const finalSha = sha(out);
  await query(`UPDATE closing_time_sign_requests SET status='completed', signed_b64=$2, signed_sha=$3, completed_at=NOW() WHERE id=$1`, [reqId, out.toString('base64'), finalSha]);
  await addEvent(reqId, { at: new Date().toISOString(), who: 'System', event: `Completed. Final fingerprint ${finalSha}` });
  await query(`UPDATE closing_time_envelopes SET status='completed', updated_at=NOW() WHERE external_id=$1`, [reqId]);
  await query(`INSERT INTO closing_time_portal_uploads (id, realtor_id, deal_id, doc_id, filename, content_type, size_bytes, data_b64, reviewed) VALUES ($1,$2,$3,'signed',$4,'application/pdf',$5,$6,TRUE)`,
    [randomUUID(), req.realtor_id, req.deal_id, `${req.document.replace(/[^\w.\- ]+/g, '_').slice(0, 150)} - signed.pdf`, out.length, out.toString('base64')]);
  const attach = [{ filename: `${req.document} - signed.pdf`, content: out.toString('base64'), contentType: 'application/pdf' }];
  const to = [...signers.map((s) => s.email), ...(req.agent_email ? [req.agent_email] : [])];
  await sendEmail({ to: Array.from(new Set(to)), subject: `Completed: ${req.document} - ${req.property}`, html: mail(`Everyone has signed "${req.document}" for ${req.property}. The signed copy, with its certificate page, is attached.`), attachments: attach }).catch(() => undefined);
}

export async function signRequestStatus(realtorId: string, reqId: string): Promise<string | null> {
  await ensure();
  const r = await query<{ status: string; expires_at: Date }>(`SELECT status, expires_at FROM closing_time_sign_requests WHERE id=$1 AND realtor_id=$2`, [reqId, realtorId]);
  if (!r[0]) return null;
  if (r[0].status === 'sent' && new Date(r[0].expires_at).getTime() < Date.now()) return 'cancelled';
  return r[0].status;
}

export async function cancelSignRequest(realtorId: string, reqId: string): Promise<void> {
  await ensure();
  await query(`UPDATE closing_time_sign_requests SET status='cancelled' WHERE id=$1 AND realtor_id=$2 AND status='sent'`, [reqId, realtorId]);
  await query(`UPDATE closing_time_envelopes SET status='cancelled', updated_at=NOW() WHERE external_id=$1 AND realtor_id=$2 AND status='sent'`, [reqId, realtorId]);
}
