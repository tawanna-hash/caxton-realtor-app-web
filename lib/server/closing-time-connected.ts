import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { query } from '@/lib/server/db/neon';
import { sendEmail } from '@/lib/email';
import { logDealEvent } from '@/lib/server/closing-time-events';
import type { AgentDeal } from '@/lib/agent-command-center-workspace';
import { dealTimeline } from '@/lib/closing-time-risks';
import { ensureAssistSchema, getUpload, markUploadStored, notifyAgentOfUpload, requireDeal } from '@/lib/server/closing-time-assist';
import { APPS, accountFor, proxyCall } from '@/lib/server/composio';

export const CALENDAR_SLUGS = ['google_calendar', 'outlook'];
export const MAIL_SLUGS = ['gmail', 'outlook'];
export const STORAGE_SLUGS = ['google_drive', 'dropbox', 'microsoft_onedrive'];

let ready: Promise<void> | null = null;
function ensure(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    await ensureAssistSchema();
    await query(`ALTER TABLE closing_time_settings ADD COLUMN IF NOT EXISTS send_from_connected BOOLEAN NOT NULL DEFAULT FALSE`);
    await query(`CREATE TABLE IF NOT EXISTS closing_time_calendar_events (
      realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE, deal_id TEXT NOT NULL, item_id TEXT NOT NULL,
      provider TEXT NOT NULL, event_id TEXT NOT NULL, event_date TEXT NOT NULL, PRIMARY KEY (realtor_id, deal_id, item_id, provider))`);
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

export async function setSendFromConnected(realtorId: string, on: boolean) {
  await ensure();
  await query(`INSERT INTO closing_time_settings (realtor_id, send_from_connected) VALUES ($1,$2) ON CONFLICT (realtor_id) DO UPDATE SET send_from_connected=EXCLUDED.send_from_connected, updated_at=NOW()`, [realtorId, on]);
}

export async function connectedState(realtorId: string) {
  await ensure();
  const [cal, mail, storage, settings] = await Promise.all([
    accountFor(realtorId, CALENDAR_SLUGS), accountFor(realtorId, MAIL_SLUGS),
    Promise.all(STORAGE_SLUGS.map((s) => accountFor(realtorId, [s]))),
    query<{ send_from_connected: boolean }>(`SELECT send_from_connected FROM closing_time_settings WHERE realtor_id=$1`, [realtorId]),
  ]);
  return {
    calendar: cal ? APPS[cal.appSlug]?.name ?? cal.appSlug : null,
    mail: mail ? APPS[mail.appSlug]?.name ?? mail.appSlug : null,
    storage: STORAGE_SLUGS.map((slug, i) => storage[i] ? { slug, name: APPS[slug]?.name ?? slug } : null).filter((x): x is { slug: string; name: string } => Boolean(x)),
    sendFromConnected: settings[0]?.send_from_connected ?? false,
  };
}

function upstreamMessage(data: unknown): string {
  const d = data as { error?: { message?: string } | string; message?: string } | string;
  const m = typeof d === 'string' ? d : typeof d?.error === 'string' ? d.error : d?.error?.message ?? d?.message ?? '';
  return String(m).slice(0, 200) || 'no details';
}

const nextDay = (d: string) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };

export async function syncCalendar(realtorId: string, dealId: string): Promise<{ added: number; updated: number; unchanged: number }> {
  await ensure();
  const deal = await requireDeal(realtorId, dealId);
  const acct = await accountFor(realtorId, CALENDAR_SLUGS);
  if (!acct) throw new Error('Connect Google Calendar or Outlook Calendar in Integrations first.');
  const google = acct.appSlug === 'google_calendar';
  const title = deal.propertyAddress || deal.title || 'Deal';
  const existing = await query<{ item_id: string; event_id: string; event_date: string }>(`SELECT item_id, event_id, event_date FROM closing_time_calendar_events WHERE realtor_id=$1 AND deal_id=$2 AND provider=$3`, [realtorId, dealId, acct.appSlug]);
  const out = { added: 0, updated: 0, unchanged: 0 };
  for (const item of dealTimeline(deal)) {
    const prior = existing.find((e) => e.item_id === item.id);
    if (prior?.event_date === item.date) { out.unchanged++; continue; }
    const summary = `${item.label} - ${title}`;
    const payload = google
      ? { summary, description: 'Added by Realty News Now Closing Time.', start: { date: item.date }, end: { date: nextDay(item.date) } }
      : { subject: summary, isAllDay: true, start: { dateTime: `${item.date}T00:00:00`, timeZone: 'America/Chicago' }, end: { dateTime: `${nextDay(item.date)}T00:00:00`, timeZone: 'America/Chicago' } };
    const base = google ? 'https://www.googleapis.com/calendar/v3/calendars/primary/events' : 'https://graph.microsoft.com/v1.0/me/events';
    const res = prior
      ? await proxyCall(realtorId, acct.id, `${base}/${encodeURIComponent(prior.event_id)}`, { method: 'PATCH', json: payload })
      : await proxyCall(realtorId, acct.id, base, { method: 'POST', json: payload });
    if (!res.ok) throw new Error(`Your calendar rejected an event (${res.status}): ${upstreamMessage(res.data)}`);
    const id = (res.data as { id?: string })?.id ?? prior?.event_id;
    if (!id) throw new Error('Calendar did not return an event id.');
    await query(`INSERT INTO closing_time_calendar_events (realtor_id, deal_id, item_id, provider, event_id, event_date) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (realtor_id, deal_id, item_id, provider) DO UPDATE SET event_id=EXCLUDED.event_id, event_date=EXCLUDED.event_date`, [realtorId, dealId, item.id, acct.appSlug, id, item.date]);
    if (prior) out.updated++; else out.added++;
  }
  return out;
}

/** Sends from the agent's own mailbox when they opted in. Returns null when not applicable so the caller can use the platform sender. */
export async function sendFromAgentMailbox(realtorId: string, m: { to: string; subject: string; text: string }): Promise<{ ok: boolean; error?: string } | null> {
  await ensure();
  const s = await query<{ send_from_connected: boolean }>(`SELECT send_from_connected FROM closing_time_settings WHERE realtor_id=$1`, [realtorId]);
  if (!s[0]?.send_from_connected) return null;
  const acct = await accountFor(realtorId, MAIL_SLUGS);
  if (!acct) return null;
  if (acct.appSlug === 'gmail') {
    const subject = `=?UTF-8?B?${Buffer.from(m.subject).toString('base64')}?=`;
    const body = Buffer.from(m.text).toString('base64').replace(/(.{76})/g, '$1\r\n');
    const mime = [`To: ${m.to}`, `Subject: ${subject}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', body].join('\r\n');
    const res = await proxyCall(realtorId, acct.id, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { json: { raw: Buffer.from(mime).toString('base64url') } });
    return res.ok ? { ok: true } : { ok: false, error: `Gmail rejected the message (${res.status})` };
  }
  const res = await proxyCall(realtorId, acct.id, 'https://graph.microsoft.com/v1.0/me/sendMail', { json: { message: { subject: m.subject, body: { contentType: 'Text', content: m.text }, toRecipients: [{ emailAddress: { address: m.to } }] }, saveToSentItems: true } });
  return res.ok ? { ok: true } : { ok: false, error: `Outlook rejected the message (${res.status})` };
}

const safe = (v: string) => v.replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 120) || 'Deal';

const STORAGE_ROOT = 'Closing Time';
const STORAGE_NAMES: Record<string, string> = { google_drive: 'Google Drive', dropbox: 'Dropbox', microsoft_onedrive: 'OneDrive' };

/** Puts one file in the agent's connected storage under Closing Time / <deal folder>. */
async function putFile(realtorId: string, slug: string, folder: string, name: string, bytes: Buffer, contentType: string): Promise<{ message: string; path: string; url: string }> {
  if (!STORAGE_SLUGS.includes(slug)) throw new Error('Unsupported storage.');
  const acct = await accountFor(realtorId, [slug]);
  if (!acct) throw new Error('Connect that storage in Integrations first.');
  if (slug === 'dropbox') {
    const res = await proxyCall(realtorId, acct.id, 'https://content.dropboxapi.com/2/files/upload', {
      body: bytes, headers: { 'Dropbox-API-Arg': JSON.stringify({ path: `/${STORAGE_ROOT}/${folder}/${name}`, mode: 'add', autorename: true }), 'content-type': 'application/octet-stream' },
    });
    if (!res.ok) throw new Error(`Dropbox rejected the file (${res.status}).`);
    return { message: `Saved to Dropbox in ${STORAGE_ROOT} / ${folder}.`, path: `Dropbox / ${STORAGE_ROOT} / ${folder}`, url: '' };
  }
  if (slug === 'microsoft_onedrive') {
    const path = `${STORAGE_ROOT}/${folder}/${name}`.split('/').map(encodeURIComponent).join('/');
    const res = await proxyCall(realtorId, acct.id, `https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/content`, { method: 'PUT', body: bytes, headers: { 'content-type': contentType || 'application/octet-stream' } });
    if (!res.ok) throw new Error(`OneDrive rejected the file (${res.status}).`);
    const webUrl = (res.data as { webUrl?: string } | null)?.webUrl ?? '';
    return { message: `Saved to OneDrive in ${STORAGE_ROOT} / ${folder}.`, path: `OneDrive / ${STORAGE_ROOT} / ${folder}`, url: /^https:\/\//.test(webUrl) ? webUrl : '' };
  }
  const findOrCreate = async (nameStr: string, parent: string | null): Promise<string> => {
    const q = `name='${nameStr.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parent ? ` and '${parent}' in parents` : ''}`;
    const found = await proxyCall(realtorId, acct.id, `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`, { method: 'GET' });
    const id = (found.data as { files?: { id: string }[] })?.files?.[0]?.id;
    if (id) return id;
    const made = await proxyCall(realtorId, acct.id, 'https://www.googleapis.com/drive/v3/files', { json: { name: nameStr, mimeType: 'application/vnd.google-apps.folder', ...(parent ? { parents: [parent] } : {}) } });
    const newId = (made.data as { id?: string })?.id;
    if (!made.ok || !newId) throw new Error(`Google Drive rejected the folder (${made.status}).`);
    return newId;
  };
  const root = await findOrCreate(STORAGE_ROOT, null);
  const dealFolder = await findOrCreate(folder, root);
  const up = await proxyCall(realtorId, acct.id, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=media', { body: bytes, headers: { 'content-type': contentType || 'application/octet-stream' } });
  const fileId = (up.data as { id?: string })?.id;
  if (!up.ok || !fileId) throw new Error(`Google Drive rejected the file (${up.status}).`);
  const mv = await proxyCall(realtorId, acct.id, `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${dealFolder}&removeParents=root&fields=id,webViewLink`, { method: 'PATCH', json: { name } });
  if (!mv.ok) throw new Error(`Google Drive could not file the document (${mv.status}).`);
  const link = (mv.data as { webViewLink?: string } | null)?.webViewLink ?? '';
  return { message: `Saved to Google Drive in ${STORAGE_ROOT} / ${folder}.`, path: `Google Drive / ${STORAGE_ROOT} / ${folder}`, url: /^https:\/\//.test(link) ? link : '' };
}

async function fileUpload(realtorId: string, dealId: string, uploadId: string, slug: string): Promise<{ message: string; path: string; url: string }> {
  await ensure();
  const deal = await requireDeal(realtorId, dealId);
  const file = await getUpload(realtorId, uploadId);
  if (!file) throw new Error('File not found.');
  const folder = safe(deal.propertyAddress || deal.title || 'Deal');
  const name = safe(file.uploader ? `${file.uploader} - ${file.filename}` : file.filename);
  return putFile(realtorId, slug, folder, name, file.bytes, file.contentType);
}

/** Files an upload in the agent's storage, then drops the copy held in the database. */
export async function saveUploadToStorage(realtorId: string, dealId: string, uploadId: string, slug: string): Promise<string> {
  const done = await fileUpload(realtorId, dealId, uploadId, slug);
  await markUploadStored(realtorId, uploadId, slug, done.path, done.url);
  return done.message;
}

/** Called right after a client uploads: files it in the agent's connected storage when there is one, then emails the agent. */
export async function fileClientUpload(realtorId: string, dealId: string, uploadId: string, info: { uploader: string; label: string; filename: string }) {
  let note = 'It is held in Closing Time until you connect document storage (Google Drive, Dropbox or OneDrive) on the Integrations page, then use Save To on the deal.';
  try {
    const state = await connectedState(realtorId);
    const slug = state.storage[0]?.slug;
    if (slug) { const done = await fileUpload(realtorId, dealId, uploadId, slug); await markUploadStored(realtorId, uploadId, slug, done.path, done.url); note = `It was filed in ${done.path}.`; }
  } catch { note = 'Closing Time could not file it in your connected storage. It is held in Closing Time. Open the deal and use Save To to try again.'; }
  await notifyAgentOfUpload(realtorId, dealId, { ...info, storedNote: note });
}

// ---- Closing a deal: the whole file goes to the agent's document storage ----

let archiveReady: Promise<void> | null = null;
function ensureArchive(): Promise<void> {
  archiveReady ??= (async () => {
    await query(`CREATE TABLE IF NOT EXISTS closing_time_archives (
      realtor_id UUID NOT NULL, deal_id TEXT NOT NULL, storage TEXT NOT NULL, path TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (realtor_id, deal_id))`);
  })().catch((e) => { archiveReady = null; throw e; });
  return archiveReady;
}

async function dealSummaryPdf(deal: AgentDeal): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 54;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const ink = rgb(0.106, 0.09, 0.149), purple = rgb(0.188, 0.114, 0.365), gray = rgb(0.29, 0.28, 0.34);
  const clean = (t: string) => t.replace(/[^\x20-\x7E]/g, ' ');
  const line = (text: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const size = o.size ?? 10; const f = o.bold ? bold : font;
    const words = clean(text).split(/\s+/); let cur = '';
    const flush = () => {
      if (y < M + size) { page = pdf.addPage([W, H]); y = H - M; }
      page.drawText(cur, { x: M, y, size, font: f, color: o.color ?? ink }); y -= size + 4; cur = '';
    };
    for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (f.widthOfTextAtSize(t, size) > W - 2 * M && cur) { flush(); cur = w; } else cur = t; }
    if (cur || words.length === 0) flush();
    y -= o.gap ?? 0;
  };
  const section = (title: string) => { y -= 8; line(title.toUpperCase(), { size: 9, bold: true, color: purple, gap: 2 }); };
  const field = (label: string, value: string) => { if (value && value.trim()) line(`${label}: ${value}`); };
  line('Closing Time: Deal File', { size: 18, bold: true, color: purple, gap: 4 });
  line(deal.propertyAddress || deal.title || 'Deal', { size: 13, bold: true });
  line(`Saved ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'long', day: 'numeric', year: 'numeric' })}`, { color: gray });
  section('Deal');
  field('Title', deal.title); field('Status', deal.status); field('Closing date', deal.closingDate); field('Effective date', deal.effectiveDate);
  field('Closed', deal.closeoutDate ? `${deal.closeoutDate} (${deal.closeoutOutcome || 'closed'})` : '');
  section('People');
  field('Buyers', [deal.buyerNames, deal.buyer2Name].filter(Boolean).join(' and ')); field('Sellers', [deal.sellerNames, deal.seller2Name].filter(Boolean).join(' and '));
  field('Lender', deal.lender ?? ''); field('Other agent', deal.otherAgent ?? ''); field('Other brokerage', deal.otherBrokerage ?? '');
  for (const c of deal.clientContacts) field(c.name || 'Contact', [c.email, c.phone].filter(Boolean).join(', '));
  section('Key dates');
  for (const item of dealTimeline(deal)) line(`${item.label}: ${item.date}`);
  section('Documents');
  for (const d of deal.documents) line(`${d.label}: ${d.status ?? ''}`);
  if (deal.documents.length === 0) line('None recorded.', { color: gray });
  section('Tasks');
  for (const t of deal.tasks) line(`${t.status === 'done' ? '[x]' : '[ ]'} ${t.title}${t.dueDate ? ` (due ${t.dueDate})` : ''}`);
  if (deal.tasks.length === 0) line('None recorded.', { color: gray });
  if (deal.notes) { section('Notes'); line(deal.notes); }
  section('Activity');
  for (const a of deal.activity.slice(-120)) line(`${a.createdAt.slice(0, 10)}  ${a.message}`);
  return Buffer.from(await pdf.save());
}

async function agentEmail(realtorId: string): Promise<string | null> {
  const r = await query<{ email: string }>(`SELECT COALESCE(NULLIF((SELECT w2.workspace->'notificationPreferences'->>'notificationEmail' FROM agent_command_center_workspaces w2 WHERE w2.realtor_id=realtors.id),''), realtors.email) AS email FROM realtors WHERE id=$1`, [realtorId]);
  return r[0]?.email ?? null;
}

export type ArchiveResult = { status: 'saved' | 'already' | 'no_storage' | 'failed'; message: string };

/** Sends the deal's file (client uploads still held here, plus a PDF record of the deal) to the agent's connected document storage. */
export async function archiveDeal(realtorId: string, dealId: string): Promise<ArchiveResult> {
  await ensure(); await ensureArchive();
  const done = await query<{ storage: string; path: string }>(`SELECT storage, path FROM closing_time_archives WHERE realtor_id=$1 AND deal_id=$2`, [realtorId, dealId]);
  if (done[0]) return { status: 'already', message: `The file is already saved in ${done[0].path}.` };
  const deal = await requireDeal(realtorId, dealId);
  const property = deal.propertyAddress || deal.title || 'your deal';
  const to = await agentEmail(realtorId);
  const state = await connectedState(realtorId);
  const slug = state.storage[0]?.slug;
  if (!slug) {
    const message = 'No document storage is connected, so the file was not saved outside Closing Time. Connect Google Drive or OneDrive in Integrations, both are free, and the file can be saved from the deal.';
    await logDealEvent(realtorId, dealId, 'archive', `Deal closed. ${message}`);
    if (to) await sendEmail({ to, subject: `${property}: Your deal closed. Connect document storage to save the file`, html: `<p>${property} closed, and Closing Time had no document storage to send the file to.</p><p>We recommend connecting a free Google Drive or Microsoft OneDrive account on the Integrations page in Closing Time. Then open the deal and send the file to your storage.</p><p>The file is still held in Closing Time in the meantime.</p>` }).catch(() => undefined);
    return { status: 'no_storage', message };
  }
  const folder = safe(deal.propertyAddress || deal.title || 'Deal');
  let last: { path: string; url: string } | null = null;
  let failed = 0; let count = 0;
  try {
    const summary = await putFile(realtorId, slug, folder, `Deal File - ${folder}.pdf`, await dealSummaryPdf(deal), 'application/pdf');
    last = summary; count += 1;
  } catch { failed += 1; }
  const held = await query<{ id: string }>(`SELECT id FROM closing_time_portal_uploads WHERE realtor_id=$1 AND deal_id=$2 AND data_b64 <> ''`, [realtorId, dealId]);
  for (const row of held) {
    try { const r = await fileUpload(realtorId, dealId, row.id, slug); await markUploadStored(realtorId, row.id, slug, r.path, r.url); last = r; count += 1; } catch { failed += 1; }
  }
  const name = STORAGE_NAMES[slug] ?? slug;
  if (failed > 0 || !last) {
    const message = `Some files could not be saved to ${name} (${failed} failed, ${count} saved). Open the deal to try again.`;
    await logDealEvent(realtorId, dealId, 'archive', `Deal closed. ${message}`);
    return { status: 'failed', message };
  }
  await query(`INSERT INTO closing_time_archives (realtor_id, deal_id, storage, path) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [realtorId, dealId, slug, last.path]);
  const message = `Deal closed. The file (${count} item${count === 1 ? '' : 's'}) was saved to ${last.path}.`;
  await logDealEvent(realtorId, dealId, 'archive', message);
  if (to) await sendEmail({ to, subject: `${property}: Your deal closed and the file was saved to ${name}`, html: `<p>${message}</p>${last.url ? `<p><a href="${last.url}">Open the folder</a></p>` : ''}` }).catch(() => undefined);
  return { status: 'saved', message };
}
