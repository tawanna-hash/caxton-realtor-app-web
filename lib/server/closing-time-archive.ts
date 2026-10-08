import JSZip from 'jszip';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { query } from '@/lib/server/db/neon';
import { sendEmail } from '@/lib/email';
import { dealTimeline } from '@/lib/closing-time-risks';
import { logDealEvent } from '@/lib/server/closing-time-events';
import { markUploadStored, requireDeal } from '@/lib/server/closing-time-assist';
import { STORAGE_NAMES, connectedState, fileUpload, putFile, safe } from '@/lib/server/closing-time-connected';
import type { AgentDeal } from '@/lib/agent-command-center-workspace';

/** Closed deals are kept for four years so the completed file and audit report can be provided to an agent who comes back. */
export const RETENTION_YEARS = 4;

let archiveReady: Promise<void> | null = null;
function ensureArchive(): Promise<void> {
  archiveReady ??= (async () => {
    await query(`CREATE TABLE IF NOT EXISTS closing_time_archives (
      realtor_id UUID NOT NULL, deal_id TEXT NOT NULL, storage TEXT NOT NULL, path TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (realtor_id, deal_id))`);
    await query(`CREATE TABLE IF NOT EXISTS closing_time_platform_archives (
      realtor_id UUID NOT NULL, deal_id TEXT NOT NULL, property TEXT NOT NULL DEFAULT '', agent_email TEXT NOT NULL DEFAULT '',
      closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), retain_until DATE NOT NULL, file_count INTEGER NOT NULL DEFAULT 0, size_bytes INTEGER NOT NULL DEFAULT 0,
      zip BYTEA NOT NULL, PRIMARY KEY (realtor_id, deal_id))`);
    await query(`CREATE INDEX IF NOT EXISTS closing_time_platform_archives_closed_idx ON closing_time_platform_archives (closed_at DESC)`);
  })().catch((e) => { archiveReady = null; throw e; });
  return archiveReady;
}

type Block = { title: string; lines: string[] };
async function pdfFrom(title: string, subtitle: string, blocks: Block[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 54;
  let page = pdf.addPage([W, H]); let y = H - M;
  const ink = rgb(0.106, 0.09, 0.149), purple = rgb(0.188, 0.114, 0.365), gray = rgb(0.29, 0.28, 0.34);
  const clean = (t: string) => t.replace(/[^\x20-\x7E]/g, ' ');
  const line = (text: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    const size = o.size ?? 10; const f = o.bold ? bold : font; const words = clean(text).split(/\s+/); let cur = '';
    const flush = () => { if (y < M + size) { page = pdf.addPage([W, H]); y = H - M; } page.drawText(cur, { x: M, y, size, font: f, color: o.color ?? ink }); y -= size + 4; cur = ''; };
    for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (f.widthOfTextAtSize(t, size) > W - 2 * M && cur) { flush(); cur = w; } else cur = t; }
    if (cur) flush();
  };
  line(title, { size: 18, bold: true, color: purple }); y -= 2;
  line(subtitle, { size: 12, bold: true });
  for (const b of blocks) {
    y -= 8; line(b.title.toUpperCase(), { size: 9, bold: true, color: purple });
    if (b.lines.length === 0) line('None recorded.', { color: gray });
    for (const l of b.lines) line(l);
  }
  return Buffer.from(await pdf.save());
}

const ymd = (d: unknown) => (d instanceof Date ? d.toISOString() : String(d ?? '')).replace('T', ' ').slice(0, 19);

async function dealSummaryPdf(deal: AgentDeal): Promise<Buffer> {
  const f = (label: string, v: string | undefined) => (v && v.trim() ? [`${label}: ${v}`] : []);
  return pdfFrom('Closing Time: Deal File', deal.propertyAddress || deal.title || 'Deal', [
    { title: 'Deal', lines: [...f('Title', deal.title), ...f('Status', deal.status), ...f('Effective date', deal.effectiveDate), ...f('Closing date', deal.closingDate), ...f('Closed', deal.closeoutDate ? `${deal.closeoutDate} (${deal.closeoutOutcome || 'closed'})` : '')] },
    { title: 'People', lines: [...f('Buyers', [deal.buyerNames, deal.buyer2Name].filter(Boolean).join(' and ')), ...f('Sellers', [deal.sellerNames, deal.seller2Name].filter(Boolean).join(' and ')), ...f('Lender', deal.lender), ...f('Other agent', deal.otherAgent), ...f('Other brokerage', deal.otherBrokerage), ...deal.clientContacts.map((c) => `${c.name || 'Contact'}: ${[c.email, c.phone].filter(Boolean).join(', ')}`)] },
    { title: 'Key dates', lines: dealTimeline(deal).map((i) => `${i.label}: ${i.date}`) },
    { title: 'Documents', lines: deal.documents.map((d) => `${d.label}: ${d.status ?? ''}`) },
    { title: 'Tasks', lines: deal.tasks.map((t) => `${t.status === 'done' ? '[x]' : '[ ]'} ${t.title}${t.dueDate ? ` (due ${t.dueDate})` : ''}`) },
    ...(deal.notes ? [{ title: 'Notes', lines: [deal.notes] }] : []),
  ]);
}

type UploadRow = { id: string; filename: string; content_type: string; uploader: string; doc_id: string; created_at: Date; stored_in: string | null; stored_path: string | null; data_b64: string };
type SignRow = { id: string; document: string; status: string; original_sha: string; signed_sha: string | null; created_at: Date; completed_at: Date | null; events: { at: string; who: string; event: string }[]; signed_b64: string | null };

async function auditReportPdf(deal: AgentDeal, uploads: UploadRow[], signs: SignRow[], signers: { request_id: string; name: string; email: string; status: string; consent_at: Date | null; signed_at: Date | null; ip: string | null }[], events: { kind: string; message: string; created_at: Date }[]): Promise<Buffer> {
  return pdfFrom('Closing Time: Audit Report', deal.propertyAddress || deal.title || 'Deal', [
    { title: 'Report', lines: [`Generated ${ymd(new Date())} UTC`, `Deal created ${ymd(deal.createdAt)} UTC`, `Closed ${deal.closeoutDate || 'n/a'} (${deal.closeoutOutcome || deal.status})`] },
    { title: 'Deal activity', lines: deal.activity.map((a) => `${ymd(a.createdAt)}  ${a.message}`) },
    { title: 'System events (emails, texts, uploads, requests, payments)', lines: events.map((e) => `${ymd(e.created_at)}  [${e.kind}] ${e.message}`) },
    { title: 'Documents received and filed', lines: uploads.map((u) => `${ymd(u.created_at)}  ${u.uploader ? `${u.uploader}: ` : ''}${u.filename}${u.stored_path ? `  (filed in ${u.stored_path})` : ''}`) },
    { title: 'Signature records', lines: signs.flatMap((s) => [
      `${s.document}: ${s.status}. Sent ${ymd(s.created_at)}${s.completed_at ? `, completed ${ymd(s.completed_at)}` : ''}`,
      `  Original fingerprint ${s.original_sha}${s.signed_sha ? `; signed fingerprint ${s.signed_sha}` : ''}`,
      ...signers.filter((x) => x.request_id === s.id).map((x) => `  Signer ${x.name} <${x.email}>: ${x.status}${x.consent_at ? `, consent ${ymd(x.consent_at)}` : ''}${x.signed_at ? `, signed ${ymd(x.signed_at)}` : ''}${x.ip ? `, from ${x.ip}` : ''}`),
      ...(s.events ?? []).map((e) => `  ${ymd(e.at)}  ${e.who}: ${e.event}`),
    ]) },
  ]);
}

/** Builds the four-year platform copy of a closed deal: the deal file, the audit report and every document held here. Built once. */
async function ensurePlatformArchive(realtorId: string, dealId: string, deal: AgentDeal, to: string | null): Promise<boolean> {
  await ensureArchive();
  const have = await query(`SELECT 1 FROM closing_time_platform_archives WHERE realtor_id=$1 AND deal_id=$2`, [realtorId, dealId]);
  if (have.length > 0) return true;
  const uploads = await query<UploadRow>(`SELECT id, filename, content_type, uploader, doc_id, created_at, stored_in, stored_path, data_b64 FROM closing_time_portal_uploads WHERE realtor_id=$1 AND deal_id=$2 ORDER BY created_at`, [realtorId, dealId]);
  const signs = await query<SignRow>(`SELECT id, document, status, original_sha, signed_sha, created_at, completed_at, events, signed_b64 FROM closing_time_sign_requests WHERE realtor_id=$1 AND deal_id=$2 ORDER BY created_at`, [realtorId, dealId]);
  const signers = signs.length ? await query<{ request_id: string; name: string; email: string; status: string; consent_at: Date | null; signed_at: Date | null; ip: string | null }>(`SELECT request_id, name, email, status, consent_at, signed_at, ip FROM closing_time_sign_signers WHERE request_id = ANY($1::uuid[]) ORDER BY idx`, [signs.map((s) => s.id)]) : [];
  const events = await query<{ kind: string; message: string; created_at: Date }>(`SELECT kind, message, created_at FROM closing_time_audit_events WHERE realtor_id=$1 AND deal_id=$2 ORDER BY created_at`, [realtorId, dealId]).catch(() => []);
  const zip = new JSZip(); let files = 0;
  zip.file('Deal File.pdf', await dealSummaryPdf(deal)); files += 1;
  zip.file('Audit Report.pdf', await auditReportPdf(deal, uploads, signs, signers, events)); files += 1;
  const seen = new Set<string>();
  const unique = (folder: string, name: string) => { let n = `${folder}/${safe(name)}`; let i = 2; while (seen.has(n)) n = `${folder}/${i++} - ${safe(name)}`; seen.add(n); return n; };
  for (const u of uploads) if (u.data_b64 && u.doc_id !== 'signed') { zip.file(unique('Documents', u.uploader ? `${u.uploader} - ${u.filename}` : u.filename), Buffer.from(u.data_b64, 'base64')); files += 1; }
  for (const s of signs) if (s.signed_b64) { zip.file(unique('Signed Documents', `${s.document} - signed.pdf`), Buffer.from(s.signed_b64, 'base64')); files += 1; }
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const retain = new Date(); retain.setUTCFullYear(retain.getUTCFullYear() + RETENTION_YEARS);
  await query(`INSERT INTO closing_time_platform_archives (realtor_id, deal_id, property, agent_email, retain_until, file_count, size_bytes, zip) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
    [realtorId, dealId, deal.propertyAddress || deal.title || 'Deal', to ?? '', retain.toISOString().slice(0, 10), files, bytes.length, bytes]);
  return true;
}

async function agentEmail(realtorId: string): Promise<string | null> {
  const r = await query<{ email: string }>(`SELECT COALESCE(NULLIF((SELECT w2.workspace->'notificationPreferences'->>'notificationEmail' FROM agent_command_center_workspaces w2 WHERE w2.realtor_id=realtors.id),''), realtors.email) AS email FROM realtors WHERE id=$1`, [realtorId]);
  return r[0]?.email ?? null;
}

export type ArchiveResult = { status: 'saved' | 'already' | 'no_storage' | 'failed'; message: string };

/** Sends the deal's file (client uploads still held here, plus a PDF record of the deal) to the agent's connected document storage. */
export async function archiveDeal(realtorId: string, dealId: string): Promise<ArchiveResult> {
  await ensureArchive();
  const done = await query<{ storage: string; path: string }>(`SELECT storage, path FROM closing_time_archives WHERE realtor_id=$1 AND deal_id=$2`, [realtorId, dealId]);
  if (done[0]) return { status: 'already', message: `The file is already saved in ${done[0].path}.` };
  const deal = await requireDeal(realtorId, dealId);
  const property = deal.propertyAddress || deal.title || 'your deal';
  const to = await agentEmail(realtorId);
  let kept = false;
  try { kept = await ensurePlatformArchive(realtorId, dealId, deal, to); } catch { kept = false; }
  const keptNote = kept ? ` A copy is also kept by Closing Time for ${RETENTION_YEARS} years.` : '';
  const state = await connectedState(realtorId);
  const slug = state.storage[0]?.slug;
  if (!slug) {
    const message = `No document storage is connected, so the file was not sent to your own storage. Connect Google Drive or OneDrive in Integrations, both are free, and the file can be saved from the deal.${keptNote}`;
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
  // The file is in the agent's storage and in the four-year platform copy, so drop the live copies. Signing records keep their fingerprints and event history.
  if (kept) await query(`UPDATE closing_time_sign_requests SET original_b64='', signed_b64=NULL WHERE realtor_id=$1 AND deal_id=$2 AND status IN ('completed','declined','cancelled')`, [realtorId, dealId]).catch(() => undefined);
  const message = `Deal closed. The file (${count} item${count === 1 ? '' : 's'}) was saved to ${last.path}.${keptNote}`;
  await logDealEvent(realtorId, dealId, 'archive', message);
  if (to) await sendEmail({ to, subject: `${property}: Your deal closed and the file was saved to ${name}`, html: `<p>${message}</p>${last.url ? `<p><a href="${last.url}">Open the folder</a></p>` : ''}` }).catch(() => undefined);
  return { status: 'saved', message };
}
