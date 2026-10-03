import { query } from '@/lib/server/db/neon';
import { dealTimeline } from '@/lib/closing-time-risks';
import { ensureAssistSchema, getUpload, requireDeal } from '@/lib/server/closing-time-assist';
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

export async function saveUploadToStorage(realtorId: string, dealId: string, uploadId: string, slug: string): Promise<string> {
  await ensure();
  if (!STORAGE_SLUGS.includes(slug)) throw new Error('Unsupported storage.');
  const deal = await requireDeal(realtorId, dealId);
  const file = await getUpload(realtorId, uploadId);
  if (!file) throw new Error('File not found.');
  const acct = await accountFor(realtorId, [slug]);
  if (!acct) throw new Error('Connect that storage in Integrations first.');
  const folder = safe(deal.propertyAddress || deal.title || 'Deal');
  const name = safe(file.filename);
  if (slug === 'dropbox') {
    const res = await proxyCall(realtorId, acct.id, 'https://content.dropboxapi.com/2/files/upload', {
      body: file.bytes, headers: { 'Dropbox-API-Arg': JSON.stringify({ path: `/Realty News Now/${folder}/${name}`, mode: 'add', autorename: true }), 'content-type': 'application/octet-stream' },
    });
    if (!res.ok) throw new Error(`Dropbox rejected the file (${res.status}).`);
    return `Saved to Dropbox in Realty News Now / ${folder}.`;
  }
  if (slug === 'microsoft_onedrive') {
    const path = `Realty News Now/${folder}/${name}`.split('/').map(encodeURIComponent).join('/');
    const res = await proxyCall(realtorId, acct.id, `https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/content`, { method: 'PUT', body: file.bytes, headers: { 'content-type': file.contentType || 'application/octet-stream' } });
    if (!res.ok) throw new Error(`OneDrive rejected the file (${res.status}).`);
    return `Saved to OneDrive in Realty News Now / ${folder}.`;
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
  const root = await findOrCreate('Realty News Now', null);
  const dealFolder = await findOrCreate(folder, root);
  const up = await proxyCall(realtorId, acct.id, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=media', { body: file.bytes, headers: { 'content-type': file.contentType || 'application/octet-stream' } });
  const fileId = (up.data as { id?: string })?.id;
  if (!up.ok || !fileId) throw new Error(`Google Drive rejected the file (${up.status}).`);
  const mv = await proxyCall(realtorId, acct.id, `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${dealFolder}&removeParents=root`, { method: 'PATCH', json: { name } });
  if (!mv.ok) throw new Error(`Google Drive could not file the document (${mv.status}).`);
  return `Saved to Google Drive in Realty News Now / ${folder}.`;
}
