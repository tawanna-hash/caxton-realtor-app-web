/**
 * Closing Time platform back office: system settings, feature switches and the release queue.
 * Features ship dark behind a switch and only go live after a maintenance notice has gone out
 * to active deal users (email and text) at least NOTICE_LEAD_DAYS days earlier.
 */
import { query } from '@/lib/server/db/neon';
import { getEmailProvider } from '@/lib/server/email';
import { sendSms, toE164 } from '@/lib/server/sms';

export const NOTICE_LEAD_DAYS = 7;
export const NOTICE_SMS_AUDIENCE = 'closing-time-alerts';

let schemaPromise: Promise<void> | null = null;
export function ensurePlatformSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS ct_platform_settings (
      key TEXT PRIMARY KEY, value JSONB NOT NULL DEFAULT 'null'::jsonb, description TEXT NOT NULL DEFAULT '',
      updated_by TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS ct_platform_setting_history (
      id BIGSERIAL PRIMARY KEY, key TEXT NOT NULL, old_value JSONB, new_value JSONB, changed_by TEXT, changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS ct_feature_flags (
      key TEXT PRIMARY KEY, label TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', enabled BOOLEAN NOT NULL DEFAULT FALSE,
      release_id TEXT, updated_by TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS ct_releases (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', flag_keys TEXT[] NOT NULL DEFAULT '{}',
      notice_subject TEXT NOT NULL DEFAULT '', notice_body TEXT NOT NULL DEFAULT '',
      go_live_at TIMESTAMPTZ, notice_sent_at TIMESTAMPTZ, notice_result JSONB,
      status TEXT NOT NULL DEFAULT 'draft', published_at TIMESTAMPTZ,
      created_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS ct_platform_log (
      id BIGSERIAL PRIMARY KEY, actor TEXT, action TEXT NOT NULL, detail JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  })().catch((e) => { schemaPromise = null; throw e; });
  return schemaPromise;
}

async function log(actor: string, action: string, detail: Record<string, unknown>) {
  await query(`INSERT INTO ct_platform_log (actor, action, detail) VALUES ($1,$2,$3::jsonb)`, [actor, action, JSON.stringify(detail)]);
}

export type Setting = { key: string; value: unknown; description: string; updated_by: string | null; updated_at: string };
export type Flag = { key: string; label: string; description: string; enabled: boolean; release_id: string | null; updated_at: string };
export type Release = {
  id: string; title: string; summary: string; flag_keys: string[]; notice_subject: string; notice_body: string;
  go_live_at: string | null; notice_sent_at: string | null; notice_result: unknown; status: string; published_at: string | null; created_at: string;
};

export async function listSettings(): Promise<Setting[]> {
  await ensurePlatformSchema();
  return query<Setting>(`SELECT key, value, description, updated_by, updated_at FROM ct_platform_settings ORDER BY key`);
}
export async function getSetting<T = unknown>(key: string, fallback: T): Promise<T> {
  await ensurePlatformSchema();
  const rows = await query<{ value: T }>(`SELECT value FROM ct_platform_settings WHERE key = $1`, [key]);
  return rows.length ? rows[0].value : fallback;
}
export async function saveSetting(key: string, value: unknown, description: string, actor: string) {
  await ensurePlatformSchema();
  const prev = await query<{ value: unknown }>(`SELECT value FROM ct_platform_settings WHERE key = $1`, [key]);
  await query(`INSERT INTO ct_platform_settings (key, value, description, updated_by, updated_at) VALUES ($1,$2::jsonb,$3,$4,NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = CASE WHEN EXCLUDED.description <> '' THEN EXCLUDED.description ELSE ct_platform_settings.description END, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [key, JSON.stringify(value), description, actor]);
  await query(`INSERT INTO ct_platform_setting_history (key, old_value, new_value, changed_by) VALUES ($1,$2::jsonb,$3::jsonb,$4)`,
    [key, JSON.stringify(prev[0]?.value ?? null), JSON.stringify(value), actor]);
}
export async function settingHistory(key?: string) {
  await ensurePlatformSchema();
  return query(`SELECT id, key, old_value, new_value, changed_by, changed_at FROM ct_platform_setting_history ${key ? 'WHERE key = $1' : ''} ORDER BY id DESC LIMIT 100`, key ? [key] : []);
}

export async function listFlags(): Promise<Flag[]> {
  await ensurePlatformSchema();
  return query<Flag>(`SELECT key, label, description, enabled, release_id, updated_at FROM ct_feature_flags ORDER BY key`);
}
/** Read a feature switch. A switch that does not exist yet counts as off. */
export async function isFeatureEnabled(key: string): Promise<boolean> {
  await ensurePlatformSchema();
  const rows = await query<{ enabled: boolean }>(`SELECT enabled FROM ct_feature_flags WHERE key = $1`, [key]);
  return rows[0]?.enabled === true;
}
export async function enabledFeatureKeys(): Promise<string[]> {
  await ensurePlatformSchema();
  return (await query<{ key: string }>(`SELECT key FROM ct_feature_flags WHERE enabled = TRUE`)).map((r) => r.key);
}
export async function createFlag(key: string, label: string, description: string, actor: string) {
  await ensurePlatformSchema();
  await query(`INSERT INTO ct_feature_flags (key, label, description, enabled, updated_by) VALUES ($1,$2,$3,FALSE,$4)
    ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description, updated_at = NOW()`, [key, label, description, actor]);
  await log(actor, 'flag.create', { key });
}

export async function listReleases(): Promise<Release[]> {
  await ensurePlatformSchema();
  return query<Release>(`SELECT id, title, summary, flag_keys, notice_subject, notice_body, go_live_at, notice_sent_at, notice_result, status, published_at, created_at FROM ct_releases ORDER BY created_at DESC`);
}
export async function saveRelease(input: { id?: string; title: string; summary: string; flagKeys: string[]; noticeSubject: string; noticeBody: string; goLiveAt: string | null }, actor: string): Promise<string> {
  await ensurePlatformSchema();
  const id = input.id ?? `rel_${Date.now().toString(36)}`;
  if (input.goLiveAt) {
    const min = Date.now() + NOTICE_LEAD_DAYS * 86400000;
    if (new Date(input.goLiveAt).getTime() < min - 60000) throw new Error(`Go-live must be at least ${NOTICE_LEAD_DAYS} days from now so the notice can go out a week ahead.`);
  }
  const existing = await query<{ status: string }>(`SELECT status FROM ct_releases WHERE id = $1`, [id]);
  if (existing[0] && existing[0].status !== 'draft') throw new Error('Only draft releases can be edited. The notice has already gone out.');
  await query(`INSERT INTO ct_releases (id, title, summary, flag_keys, notice_subject, notice_body, go_live_at, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, summary=EXCLUDED.summary, flag_keys=EXCLUDED.flag_keys, notice_subject=EXCLUDED.notice_subject, notice_body=EXCLUDED.notice_body, go_live_at=EXCLUDED.go_live_at, updated_at=NOW()`,
    [id, input.title, input.summary, input.flagKeys, input.noticeSubject, input.noticeBody, input.goLiveAt, actor]);
  await log(actor, 'release.save', { id });
  return id;
}

type Recipient = { email: string; phone: string | null; name: string };
function dealIsOpen(deal: Record<string, unknown>): boolean {
  return !deal.isTemplate && !deal.auditLocked && !deal.closeoutOutcome;
}
/** Active deal users: account holders with at least one open deal in their workspace. */
export async function activeDealUsers(): Promise<Recipient[]> {
  const rows = await query<{ email: string; first_name: string | null; workspace: { deals?: Record<string, unknown>[]; notificationPreferences?: { smsEnabled?: boolean; smsPhone?: string } } }>(
    `SELECT r.email, r.first_name, w.workspace FROM agent_command_center_workspaces w JOIN realtors r ON r.id = w.realtor_id WHERE r.email_verified_at IS NOT NULL`);
  const out: Recipient[] = [];
  for (const r of rows) {
    const deals = r.workspace?.deals ?? [];
    if (!deals.some(dealIsOpen)) continue;
    const prefs = r.workspace?.notificationPreferences;
    out.push({ email: r.email, name: r.first_name ?? '', phone: prefs?.smsEnabled ? toE164(prefs.smsPhone) : null });
  }
  return out;
}

const escapeHtml = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));

/** Sends the maintenance notice by email and text to active deal users, once per release. */
export async function sendReleaseNotice(id: string, actor: string, smsEnabled: boolean) {
  await ensurePlatformSchema();
  const [rel] = await query<Release>(`SELECT * FROM ct_releases WHERE id = $1`, [id]);
  if (!rel) throw new Error('Release not found.');
  if (rel.status !== 'draft') throw new Error('The notice for this release has already been sent.');
  if (!rel.go_live_at) throw new Error('Set a go-live date first.');
  if (new Date(rel.go_live_at).getTime() < Date.now() + NOTICE_LEAD_DAYS * 86400000 - 60000) throw new Error(`The go-live date must be at least ${NOTICE_LEAD_DAYS} days away.`);
  if (!rel.notice_subject.trim() || !rel.notice_body.trim()) throw new Error('Write the notice subject and message first.');
  const users = await activeDealUsers();
  const when = new Date(rel.go_live_at).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Chicago' });
  const provider = getEmailProvider();
  let emailed = 0; const emailFailed: string[] = [];
  for (const u of users) {
    const text = `${u.name ? `Hi ${u.name},\n\n` : ''}${rel.notice_body}\n\nScheduled update: ${when} Central.\n\nIt's Almost Closing Time`;
    const html = `<div style="font-family:Inter,Arial,sans-serif;color:#1B1726;max-width:560px"><p>${u.name ? `Hi ${escapeHtml(u.name)},` : ''}</p>${rel.notice_body.split('\n').map((l) => `<p>${escapeHtml(l)}</p>`).join('')}<p><strong>Scheduled update:</strong> ${escapeHtml(when)} Central.</p><p style="color:#4A4757">It's Almost Closing Time</p></div>`;
    try { const r = await provider.send({ to: { email: u.email, name: u.name }, subject: rel.notice_subject, text, html, emailType: 'closing-time-maintenance-notice', tags: ['maintenance-notice'], disableTracking: true }); if (r.success) emailed += 1; else emailFailed.push(u.email); } catch { emailFailed.push(u.email); }
  }
  let texted = 0; let textSkipped = 0; let textFailed = 0; let textNote = '';
  const phones = users.map((u) => u.phone).filter((p): p is string => Boolean(p));
  if (!smsEnabled) textNote = 'Text notices are switched off in settings (carrier approval pending).';
  else if (phones.length) {
    try { const r = await sendSms(NOTICE_SMS_AUDIENCE, `Closing Time: ${rel.title} update scheduled ${when} Central. ${rel.summary}`.slice(0, 300), phones); texted = r.sent.length; textSkipped = r.skipped.length; textFailed = r.failed.length; } catch (e) { textNote = e instanceof Error ? e.message : 'Text send failed.'; }
  }
  const result = { recipients: users.length, emailed, emailFailed, texted, textSkipped, textFailed, textNote };
  await query(`UPDATE ct_releases SET status = 'notified', notice_sent_at = NOW(), notice_result = $2::jsonb, updated_at = NOW() WHERE id = $1`, [id, JSON.stringify(result)]);
  await log(actor, 'release.notice', { id, ...result });
  return result;
}

/** Turns on the release's switches. Refused until the notice has been out for the full lead time. */
export async function publishRelease(id: string, actor: string) {
  await ensurePlatformSchema();
  const [rel] = await query<Release>(`SELECT * FROM ct_releases WHERE id = $1`, [id]);
  if (!rel) throw new Error('Release not found.');
  if (rel.status !== 'notified' || !rel.notice_sent_at) throw new Error('Send the maintenance notice first.');
  if (Date.now() < new Date(rel.notice_sent_at).getTime() + NOTICE_LEAD_DAYS * 86400000 - 60000) throw new Error(`The notice must be out for ${NOTICE_LEAD_DAYS} days before this goes live.`);
  if (rel.go_live_at && Date.now() < new Date(rel.go_live_at).getTime() - 60000) throw new Error('It is not yet the scheduled go-live time.');
  await query(`UPDATE ct_feature_flags SET enabled = TRUE, release_id = $2, updated_by = $3, updated_at = NOW() WHERE key = ANY($1::text[])`, [rel.flag_keys, id, actor]);
  await query(`UPDATE ct_releases SET status = 'live', published_at = NOW(), updated_at = NOW() WHERE id = $1`, [id]);
  await log(actor, 'release.publish', { id, flags: rel.flag_keys });
}

export async function cancelRelease(id: string, actor: string) {
  await ensurePlatformSchema();
  await query(`UPDATE ct_releases SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND status IN ('draft','notified')`, [id]);
  await log(actor, 'release.cancel', { id });
}
/** Emergency switch-off for a live feature. Needs no notice. */
export async function disableFlag(key: string, actor: string) {
  await ensurePlatformSchema();
  await query(`UPDATE ct_feature_flags SET enabled = FALSE, updated_by = $2, updated_at = NOW() WHERE key = $1`, [key, actor]);
  await log(actor, 'flag.disable', { key });
}
export async function platformLog() {
  await ensurePlatformSchema();
  return query(`SELECT id, actor, action, detail, created_at FROM ct_platform_log ORDER BY id DESC LIMIT 100`);
}
