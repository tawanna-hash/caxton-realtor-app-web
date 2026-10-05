import { createHash, createHmac, randomBytes, randomUUID } from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getAgentAccountDetails } from '@/lib/server/agent-account-details';
import { stampBrokerageFooter } from '@/lib/server/brokerage-footer-pdf';
import { query } from '@/lib/server/db/neon';
import { sendEmail } from '@/lib/email';
import { ensureAssistSchema, getUpload, requireDeal } from '@/lib/server/closing-time-assist';
import { getCalculatorBranding } from '@/lib/server/calculator-branding-store';

export type SignField = { id: string; signer: number; type: 'signature' | 'date'; page: number; x: number; y: number; w: number; h: number };
export type SignerInput = { name: string; email: string };
type EventRow = { at: string; who: string; event: string; ip?: string };

const MAX_BYTES = 3 * 1024 * 1024;
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
export type SignSettings = { expireDays: number; remindEvery: number; maxReminders: number; draw: boolean; type: boolean; upload: boolean; notice: string; redirectUrl: string; attach: boolean; emailRequester: boolean; accent: string; brandName: string };
export const DEFAULT_SIGN_SETTINGS: SignSettings = { expireDays: 30, remindEvery: 3, maxReminders: 3, draw: true, type: true, upload: false, notice: '', redirectUrl: '', attach: true, emailRequester: true, accent: '#301D5D', brandName: '' };
type Brand = { name: string; logo: string; accent: string };
const int = (v: unknown, lo: number, hi: number, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
export function cleanSettings(raw: Partial<SignSettings>): SignSettings {
  const d = DEFAULT_SIGN_SETTINGS;
  const methods = { draw: raw.draw ?? d.draw, type: raw.type ?? d.type, upload: raw.upload ?? d.upload };
  if (!methods.draw && !methods.type && !methods.upload) methods.type = true;
  const url = String(raw.redirectUrl ?? '').trim();
  return {
    expireDays: int(raw.expireDays, 1, 365, d.expireDays), remindEvery: int(raw.remindEvery, 0, 60, d.remindEvery), maxReminders: int(raw.maxReminders, 0, 10, d.maxReminders),
    ...methods, notice: String(raw.notice ?? '').slice(0, 400), redirectUrl: /^https:\/\/[^\s]+$/.test(url) ? url.slice(0, 500) : '',
    attach: raw.attach ?? d.attach, emailRequester: raw.emailRequester ?? d.emailRequester,
    accent: /^#[0-9a-fA-F]{6}$/.test(String(raw.accent ?? '')) ? String(raw.accent) : d.accent, brandName: String(raw.brandName ?? '').trim().slice(0, 80),
  };
}
const mail = (text: string, link?: { href: string; label: string }, brand?: Brand) => `<div style="font-family:Arial,sans-serif;color:#1e293b;line-height:1.55;max-width:600px">${brand?.logo ? `<p style="margin:0 0 16px"><img src="${esc(brand.logo)}" alt="${esc(brand.name)}" style="max-height:48px;max-width:200px"></p>` : brand?.name ? `<p style="margin:0 0 16px;font-weight:bold;font-size:16px">${esc(brand.name)}</p>` : ''}${esc(text).replace(/\n/g, '<br>')}${link ? `<p style="margin:24px 0"><a href="${link.href}" style="background:${brand?.accent ?? '#301D5D'};color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">${esc(link.label)}</a></p>` : ''}<p style="margin:24px 0 0;font-size:12px;color:#64748b">Sent with Closing Time Secure Sign</p></div>`;

function tokenFor(reqId: string, idx: number, nonce: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('Signing is not configured.');
  return createHmac('sha256', secret).update(`${reqId}:${idx}:${nonce}`).digest('base64url');
}

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
    await query(`ALTER TABLE closing_time_sign_requests ADD COLUMN IF NOT EXISTS opts JSONB NOT NULL DEFAULT '{}'`);
    await query(`ALTER TABLE closing_time_sign_signers ADD COLUMN IF NOT EXISTS nonce TEXT`);
    await query(`ALTER TABLE closing_time_sign_signers ADD COLUMN IF NOT EXISTS reminders_sent INT NOT NULL DEFAULT 0`);
    await query(`ALTER TABLE closing_time_sign_signers ADD COLUMN IF NOT EXISTS last_reminded_at TIMESTAMPTZ`);
    await query(`CREATE TABLE IF NOT EXISTS closing_time_sign_settings (realtor_id UUID PRIMARY KEY REFERENCES realtors(id) ON DELETE CASCADE, data JSONB NOT NULL DEFAULT '{}')`);
    await query(`CREATE TABLE IF NOT EXISTS closing_time_sign_layouts (id UUID PRIMARY KEY, realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE, name TEXT NOT NULL, roles INT NOT NULL, fields JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

export async function getSignSettings(realtorId: string): Promise<SignSettings> {
  await ensure();
  const r = await query<{ data: Partial<SignSettings> }>(`SELECT data FROM closing_time_sign_settings WHERE realtor_id=$1`, [realtorId]);
  return cleanSettings(r[0]?.data ?? {});
}
export async function saveSignSettings(realtorId: string, raw: Partial<SignSettings>): Promise<void> {
  await ensure();
  await query(`INSERT INTO closing_time_sign_settings (realtor_id, data) VALUES ($1,$2::jsonb) ON CONFLICT (realtor_id) DO UPDATE SET data=EXCLUDED.data`, [realtorId, JSON.stringify(cleanSettings(raw))]);
}
type LayoutField = Omit<SignField, 'id'>;
export async function listSignLayouts(realtorId: string) {
  await ensure();
  return query<{ id: string; name: string; roles: number; fields: LayoutField[] }>(`SELECT id, name, roles, fields FROM closing_time_sign_layouts WHERE realtor_id=$1 ORDER BY created_at DESC LIMIT 30`, [realtorId]);
}
export async function saveSignLayout(realtorId: string, name: string, fields: LayoutField[]): Promise<void> {
  await ensure();
  const clean = fields.slice(0, 80).map((f) => ({ signer: int(f.signer, 0, 5, 0), type: f.type === 'date' ? 'date' : 'signature', page: int(f.page, 0, 400, 0), x: clamp(f.x), y: clamp(f.y), w: clamp(f.w), h: clamp(f.h) }));
  if (!clean.length) throw new Error('Place at least one field first.');
  await query(`INSERT INTO closing_time_sign_layouts (id, realtor_id, name, roles, fields) VALUES ($1,$2,$3,$4,$5::jsonb)`, [randomUUID(), realtorId, name.trim().slice(0, 80) || 'Layout', Math.max(...clean.map((f) => f.signer)) + 1, JSON.stringify(clean)]);
}
export async function deleteSignLayout(realtorId: string, id: string): Promise<void> {
  await ensure();
  await query(`DELETE FROM closing_time_sign_layouts WHERE id=$1 AND realtor_id=$2`, [id, realtorId]);
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
  expireDays?: number; remindEvery?: number; maxReminders?: number;
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
  await stampBrokerageFooter(pdf, await getAgentAccountDetails(realtorId).catch(() => null));
  const bytes = Buffer.from(await pdf.save());
  const me = await query<{ first_name: string | null; last_name: string | null; email: string }>(`SELECT first_name, last_name, COALESCE(NULLIF((SELECT w2.workspace->'notificationPreferences'->>'notificationEmail' FROM agent_command_center_workspaces w2 WHERE w2.realtor_id=realtors.id),''), realtors.email) AS email FROM realtors WHERE id=$1`, [realtorId]);
  const agentName = [me[0]?.first_name, me[0]?.last_name].filter(Boolean).join(' ') || 'Your agent';
  const base = await getSignSettings(realtorId);
  const set = cleanSettings({ ...base, expireDays: input.expireDays ?? base.expireDays, remindEvery: input.remindEvery ?? base.remindEvery, maxReminders: input.maxReminders ?? base.maxReminders });
  const bd = await getCalculatorBranding(realtorId).catch(() => null);
  const logo = bd?.brand.logo_url && /^https:\/\//i.test(bd.brand.logo_url) ? bd.brand.logo_url : '';
  const brand: Brand = { name: set.brandName || bd?.brand.company || bd?.brand.name || agentName, logo, accent: set.accent };
  const opts = { ...set, brandName: brand.name, logo };
  const reqId = randomUUID();
  await query(`INSERT INTO closing_time_sign_requests (id, realtor_id, deal_id, document, property, agent_name, agent_email, fields, original_b64, original_sha, events, expires_at, opts)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::jsonb, NOW() + ($12 || ' days')::interval, $13::jsonb)`,
    [reqId, realtorId, input.dealId, docName, property, agentName, me[0]?.email ?? '', JSON.stringify(fields), bytes.toString('base64'), sha(bytes), JSON.stringify([{ at: new Date().toISOString(), who: agentName, event: 'Sent for signature' }]), String(set.expireDays), JSON.stringify(opts)]);
  const links: { to: SignerInput; token: string }[] = [];
  for (let i = 0; i < input.signers.length; i += 1) {
    const nonce = randomBytes(16).toString('hex');
    const token = tokenFor(reqId, i, nonce);
    await query(`INSERT INTO closing_time_sign_signers (id, request_id, idx, name, email, token_hash, nonce) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [randomUUID(), reqId, i, input.signers[i].name, input.signers[i].email, sha(token), nonce]);
    links.push({ to: input.signers[i], token });
  }
  await query(`INSERT INTO closing_time_envelopes (id, realtor_id, deal_id, provider, external_id, document, signers) VALUES ($1,$2,$3,'builtin',$4,$5,$6::jsonb)`, [randomUUID(), realtorId, input.dealId, reqId, docName, JSON.stringify(input.signers)]);
  const subject = (input.subject?.trim() || `Please sign: ${docName} - ${property}`).slice(0, 200);
  const failed: string[] = [];
  await Promise.all(links.map(async ({ to, token }) => {
    const r = await sendEmail({ to: to.email, replyTo: me[0]?.email || undefined, subject, html: mail(`Hello ${to.name},\n\n${agentName} has sent you "${docName}" for ${property} to review and sign electronically.\n\nThe link is private to you and expires in ${set.expireDays} days.`, { href: `${input.origin}/sign/${token}`, label: 'Review And Sign' }, brand) });
    if (!r.ok) failed.push(to.email);
  }));
  if (failed.length === links.length) { await query(`UPDATE closing_time_sign_requests SET status='cancelled' WHERE id=$1`, [reqId]); await query(`UPDATE closing_time_envelopes SET status='cancelled' WHERE external_id=$1`, [reqId]); throw new Error('The signing emails could not be sent. Try again.'); }
  return `Sent "${docName}" for secure signature to ${input.signers.map((s) => s.email).join(', ')}.${failed.length ? ` These emails failed: ${failed.join(', ')}.` : ''}`;
}

type Row = { id: string; realtor_id: string; deal_id: string; document: string; property: string; agent_name: string; agent_email: string; fields: SignField[]; original_b64: string; original_sha: string; opts: Partial<SignSettings> & { logo?: string }; signed_b64: string | null; signed_sha: string | null; status: string; events: EventRow[]; expires_at: Date; created_at: Date };
type SignerRow = { id: string; request_id: string; idx: number; name: string; email: string; status: string; consent_at: Date | null; signed_at: Date | null; ip: string | null; marks: Record<string, { kind: 'typed' | 'drawn' | 'uploaded'; value: string }>; decline_reason: string | null };

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
    methods: { draw: req.opts.draw ?? true, type: req.opts.type ?? true, upload: req.opts.upload ?? false },
    notice: req.opts.notice ?? '', accent: req.opts.accent ?? '#301D5D', brandName: req.opts.brandName ?? '', logo: req.opts.logo ?? '',
    redirectUrl: req.opts.redirectUrl ?? '',
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

export async function submitSignature(token: string, body: { consent: boolean; marks: Record<string, { kind: 'typed' | 'drawn' | 'uploaded'; value: string }> }, ctx: { ip: string; ua: string }): Promise<{ ok: true; completed: boolean } | { ok: false; error: string }> {
  const f = await byToken(token);
  if (!f) return { ok: false, error: 'This link is not valid.' };
  const { req, me } = f;
  if (req.status !== 'sent' || expired(req)) return { ok: false, error: 'This document can no longer be signed.' };
  if (me.status !== 'pending') return { ok: false, error: 'You have already responded.' };
  if (!body.consent) return { ok: false, error: 'You must agree to sign electronically.' };
  const mine = req.fields.filter((x) => x.signer === me.idx);
  const marks: Record<string, { kind: 'typed' | 'drawn' | 'uploaded'; value: string }> = {};
  for (const fld of mine.filter((x) => x.type === 'signature')) {
    const m = body.marks[fld.id];
    if (!m || (m.kind !== 'typed' && m.kind !== 'drawn' && m.kind !== 'uploaded') || typeof m.value !== 'string') return { ok: false, error: 'Please sign every signature box.' };
    if (!(req.opts[m.kind === 'typed' ? 'type' : m.kind === 'drawn' ? 'draw' : 'upload'] ?? (m.kind !== 'uploaded'))) return { ok: false, error: 'That signature method is not allowed for this document.' };
    if (m.kind === 'typed' && (m.value.trim().length < 2 || m.value.length > 80)) return { ok: false, error: 'Type your full name to sign.' };
    if (m.kind === 'drawn' && (!m.value.startsWith('data:image/png;base64,') || m.value.length > 300_000)) return { ok: false, error: 'That drawn signature could not be used.' };
    if (m.kind === 'uploaded' && (!/^data:image\/(png|jpeg);base64,/.test(m.value) || m.value.length > 400_000)) return { ok: false, error: 'That signature image could not be used. Use a PNG or JPG under 300 KB.' };
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
    if (m.kind === 'drawn' || m.kind === 'uploaded') {
      const raw = Buffer.from(m.value.slice(m.value.indexOf(',') + 1), 'base64');
      const img = m.value.startsWith('data:image/jpeg') ? await pdf.embedJpg(raw) : await pdf.embedPng(raw);
      const scale = Math.min(w / img.width, h / img.height);
      page.drawImage(img, { x, y: yBottom, width: img.width * scale, height: img.height * scale });
    } else {
      const size = Math.min(26, h * 0.7);
      page.drawText(m.value, { x: x + 2, y: yBottom + h * 0.2, size, font: script, color: rgb(0.05, 0.1, 0.35), maxWidth: w });
    }
  }
  const cert = pdf.addPage([612, 792]);
  let y = 730;
  cert.drawText('Closing Time Secure Sign - Certificate Of Electronic Signature', { x: 54, y, size: 16, font: bold, color: rgb(0.13, 0.1, 0.25) }); y -= 24;
  const line = (t: string, b = false, size = 9.5) => {
    const f = b ? bold : font;
    const words = t.split(' ');
    let cur = '';
    const out: string[] = [];
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (cur && f.widthOfTextAtSize(next, size) > 504) { out.push(cur); cur = w; } else cur = next;
    }
    if (cur) out.push(cur);
    for (const l of out) { cert.drawText(l, { x: 54, y, size, font: f, color: rgb(0.15, 0.15, 0.2) }); y -= size + 4; }
    y -= 2;
  };
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
  const brand: Brand = { name: req.opts.brandName || req.agent_name, logo: req.opts.logo ?? '', accent: req.opts.accent ?? '#301D5D' };
  const withFile = req.opts.attach ?? true;
  const to = [...signers.map((s) => s.email), ...(req.agent_email && (req.opts.emailRequester ?? true) ? [req.agent_email] : [])];
  await sendEmail({ to: Array.from(new Set(to)), subject: `Completed: ${req.document} - ${req.property}`, html: mail(`Everyone has signed "${req.document}" for ${req.property}. ${withFile ? 'The signed copy, with its certificate page, is attached.' : 'Open your original signing link to download the signed copy.'}`, undefined, brand), ...(withFile ? { attachments: attach } : {}) }).catch(() => undefined);
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

export async function listSignRequests(realtorId: string, dealId: string) {
  await ensure();
  const rows = await query<{ id: string; document: string; status: string; created_at: Date; expires_at: Date; signed: number; total: number }>(
    `SELECT r.id, r.document, r.status, r.created_at, r.expires_at,
       (SELECT COUNT(*)::int FROM closing_time_sign_signers s WHERE s.request_id=r.id AND s.status='signed') AS signed,
       (SELECT COUNT(*)::int FROM closing_time_sign_signers s WHERE s.request_id=r.id) AS total
     FROM closing_time_sign_requests r WHERE r.realtor_id=$1 AND r.deal_id=$2 ORDER BY r.created_at DESC LIMIT 50`, [realtorId, dealId]);
  return rows.map((r) => ({ id: r.id, document: r.document, status: r.status === 'sent' && new Date(r.expires_at).getTime() < Date.now() ? 'expired' : r.status, createdAt: new Date(r.created_at).toISOString(), signed: r.signed, total: r.total }));
}

export async function runSignReminders(origin: string): Promise<{ sent: number; errors: string[] }> {
  await ensure();
  const rows = await query<{ rid: string; sid: string; idx: number; name: string; email: string; nonce: string | null; sent: number; document: string; property: string; agent_name: string; agent_email: string; opts: Partial<SignSettings> & { logo?: string } }>(
    `SELECT r.id AS rid, s.id AS sid, s.idx, s.name, s.email, s.nonce, s.reminders_sent AS sent, r.document, r.property, r.agent_name, r.agent_email, r.opts
     FROM closing_time_sign_requests r JOIN closing_time_sign_signers s ON s.request_id=r.id
     WHERE r.status='sent' AND r.expires_at > NOW() AND s.status='pending' AND s.nonce IS NOT NULL
       AND COALESCE((r.opts->>'remindEvery')::int,0) > 0
       AND s.reminders_sent < COALESCE((r.opts->>'maxReminders')::int,0)
       AND COALESCE(s.last_reminded_at, r.created_at) <= NOW() - (COALESCE((r.opts->>'remindEvery')::int,0) || ' days')::interval`);
  let sent = 0; const errors: string[] = [];
  for (const r of rows) {
    try {
      const brand: Brand = { name: r.opts.brandName || r.agent_name, logo: r.opts.logo ?? '', accent: r.opts.accent ?? '#301D5D' };
      const res = await sendEmail({ to: r.email, replyTo: r.agent_email || undefined, subject: `Reminder: please sign ${r.document} - ${r.property}`, html: mail(`Hello ${r.name},\n\nThis is a reminder that ${r.agent_name} is waiting for your signature on "${r.document}" for ${r.property}.`, { href: `${origin}/sign/${tokenFor(r.rid, r.idx, r.nonce!)}`, label: 'Review And Sign' }, brand) });
      if (!res.ok) { errors.push(r.email); continue; }
      await query(`UPDATE closing_time_sign_signers SET reminders_sent = reminders_sent + 1, last_reminded_at = NOW() WHERE id=$1`, [r.sid]);
      await addEvent(r.rid, { at: new Date().toISOString(), who: 'System', event: `Reminder ${r.sent + 1} sent to ${r.email}` });
      sent += 1;
    } catch (e) { errors.push(String(e)); }
  }
  return { sent, errors };
}
