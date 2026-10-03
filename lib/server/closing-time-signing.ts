import { randomUUID } from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { query } from '@/lib/server/db/neon';
import { ensureAssistSchema, getUpload, requireDeal } from '@/lib/server/closing-time-assist';
import { accountFor, appInfo, proxyCall } from '@/lib/server/composio';

export const SIGN_PROVIDERS = ['docusign', 'boldsign'] as const;
export type SignProvider = (typeof SIGN_PROVIDERS)[number];
export type Signer = { name: string; email: string };
const MAX_BYTES = 3 * 1024 * 1024;

let ready: Promise<void> | null = null;
function ensure(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    await ensureAssistSchema();
    await query(`CREATE TABLE IF NOT EXISTS closing_time_envelopes (
      id UUID PRIMARY KEY, realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE, deal_id TEXT NOT NULL,
      provider TEXT NOT NULL, external_id TEXT NOT NULL, document TEXT NOT NULL, signers JSONB NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'sent', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query(`CREATE INDEX IF NOT EXISTS closing_time_envelopes_deal_idx ON closing_time_envelopes (realtor_id, deal_id, created_at DESC)`);
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : String(d));

function upstreamMessage(data: unknown): string {
  const d = data as { message?: string; error?: string | { message?: string }; errorCode?: string; Error?: string } | string;
  const m = typeof d === 'string' ? d : d?.message ?? (typeof d?.error === 'string' ? d.error : d?.error?.message) ?? d?.Error ?? d?.errorCode ?? '';
  return String(m).slice(0, 200) || 'no details';
}

export async function signingState(realtorId: string, dealId: string) {
  await ensure();
  const [accts, rows] = await Promise.all([
    Promise.all(SIGN_PROVIDERS.map((s) => accountFor(realtorId, [s]))),
    query<{ id: string; provider: string; document: string; signers: Signer[]; status: string; created_at: unknown }>(
      `SELECT id, provider, document, signers, status, created_at FROM closing_time_envelopes WHERE realtor_id=$1 AND deal_id=$2 ORDER BY created_at DESC LIMIT 20`, [realtorId, dealId]),
  ]);
  return {
    providers: SIGN_PROVIDERS.filter((_, i) => accts[i]).map((slug) => ({ slug, name: appInfo(slug)?.name ?? slug })),
    envelopes: rows.map((r) => ({ id: r.id, provider: appInfo(r.provider)?.name ?? r.provider, document: r.document, signers: r.signers, status: r.status, createdAt: iso(r.created_at) })),
  };
}

/** Adds a clean final page with one signature line per signer so fields never cover contract text. */
async function prepareDocument(bytes: Buffer, signers: Signer[], provider: SignProvider, title: string): Promise<Buffer> {
  let pdf: PDFDocument;
  try { pdf = await PDFDocument.load(bytes, { ignoreEncryption: true }); }
  catch { throw new Error('Only PDF files can be sent for signature.'); }
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([612, 792]);
  page.drawText('Signature Page', { x: 72, y: 720, size: 18, font: bold, color: rgb(0.13, 0.1, 0.25) });
  page.drawText(title.slice(0, 90), { x: 72, y: 698, size: 10, font, color: rgb(0.35, 0.35, 0.4) });
  signers.forEach((s, i) => {
    const top = 640 - i * 100;
    page.drawLine({ start: { x: 72, y: top - 40 }, end: { x: 340, y: top - 40 }, thickness: 0.8, color: rgb(0.2, 0.2, 0.25) });
    page.drawText(s.name, { x: 72, y: top - 56, size: 10, font: bold, color: rgb(0.1, 0.1, 0.15) });
    page.drawText('Date: ____________________', { x: 370, y: top - 36, size: 10, font, color: rgb(0.2, 0.2, 0.25) });
    const tag = provider === 'docusign' ? `/s${i + 1}/` : `{{sign|${i + 1}|*|Signature}}`;
    page.drawText(tag, { x: 74, y: top - 36, size: 7, font, color: rgb(1, 1, 1) });
  });
  return Buffer.from(await pdf.save());
}

type SendInput = { dealId: string; provider: SignProvider; uploadId?: string; fileName?: string; fileB64?: string; signers: Signer[]; subject?: string };

export async function sendForSignature(realtorId: string, input: SendInput): Promise<string> {
  await ensure();
  const deal = await requireDeal(realtorId, input.dealId);
  const acct = await accountFor(realtorId, [input.provider]);
  if (!acct) throw new Error('Connect that signing app in Integrations first.');
  let raw: Buffer; let name: string;
  if (input.uploadId) {
    const file = await getUpload(realtorId, input.uploadId);
    if (!file) throw new Error('File not found.');
    raw = file.bytes; name = file.filename;
  } else if (input.fileB64 && input.fileName) {
    raw = Buffer.from(input.fileB64, 'base64'); name = input.fileName;
  } else throw new Error('Choose a PDF to send.');
  if (raw.length > MAX_BYTES) throw new Error('That file is over 3 MB. Send a smaller PDF.');
  const property = deal.propertyAddress || deal.title || 'Deal';
  const docName = name.replace(/\.pdf$/i, '').slice(0, 120) || 'Document';
  const subject = (input.subject?.trim() || `Please sign: ${docName} - ${property}`).slice(0, 200);
  const pdf = await prepareDocument(raw, input.signers, input.provider, `${docName} - ${property}`);
  const b64 = pdf.toString('base64');
  let externalId = '';

  if (input.provider === 'docusign') {
    let info = await proxyCall(realtorId, acct.id, 'https://account.docusign.com/oauth/userinfo', { method: 'GET' });
    if (!info.ok) info = await proxyCall(realtorId, acct.id, 'https://account-d.docusign.com/oauth/userinfo', { method: 'GET' });
    if (!info.ok) throw new Error(`DocuSign did not accept the connection (${info.status}): ${upstreamMessage(info.data)}`);
    const accounts = (info.data as { accounts?: { account_id: string; is_default?: boolean; base_uri: string }[] }).accounts ?? [];
    const account = accounts.find((a) => a.is_default) ?? accounts[0];
    if (!account) throw new Error('DocuSign did not return an account.');
    const res = await proxyCall(realtorId, acct.id, `${account.base_uri}/restapi/v2.1/accounts/${account.account_id}/envelopes`, {
      json: {
        emailSubject: subject, status: 'sent',
        documents: [{ documentBase64: b64, name: `${docName}.pdf`, fileExtension: 'pdf', documentId: '1' }],
        recipients: { signers: input.signers.map((s, i) => ({ email: s.email, name: s.name, recipientId: String(i + 1), routingOrder: '1', tabs: { signHereTabs: [{ anchorString: `/s${i + 1}/`, anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '0' }] } })) },
      },
    });
    externalId = (res.data as { envelopeId?: string })?.envelopeId ?? '';
    if (!res.ok || !externalId) throw new Error(`DocuSign rejected the document (${res.status}): ${upstreamMessage(res.data)}`);
  } else {
    const res = await proxyCall(realtorId, acct.id, 'https://api.boldsign.com/v1/document/send', {
      json: {
        Title: subject, Message: `Please review and sign ${docName} for ${property}.`, UseTextTags: true, EnableSigningOrder: false,
        Signers: input.signers.map((s, i) => ({ Name: s.name, EmailAddress: s.email, SignerType: 'Signer', SignerOrder: i + 1 })),
        Files: [`data:application/pdf;base64,${b64}`],
      },
    });
    externalId = (res.data as { documentId?: string })?.documentId ?? '';
    if (!res.ok || !externalId) throw new Error(`BoldSign rejected the document (${res.status}): ${upstreamMessage(res.data)}`);
  }

  await query(`INSERT INTO closing_time_envelopes (id, realtor_id, deal_id, provider, external_id, document, signers) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [randomUUID(), realtorId, input.dealId, input.provider, externalId, docName, JSON.stringify(input.signers)]);
  return `Sent "${docName}" for signature through ${appInfo(input.provider)?.name}. ${input.signers.map((s) => s.email).join(', ')} will get an email from them.`;
}

export async function refreshEnvelope(realtorId: string, id: string): Promise<string> {
  await ensure();
  const rows = await query<{ provider: SignProvider; external_id: string; status: string }>(`SELECT provider, external_id, status FROM closing_time_envelopes WHERE id=$1 AND realtor_id=$2`, [id, realtorId]);
  const row = rows[0];
  if (!row) throw new Error('Not found.');
  const acct = await accountFor(realtorId, [row.provider]);
  if (!acct) throw new Error('Reconnect that signing app in Integrations first.');
  let status = row.status;
  if (row.provider === 'docusign') {
    let info = await proxyCall(realtorId, acct.id, 'https://account.docusign.com/oauth/userinfo', { method: 'GET' });
    if (!info.ok) info = await proxyCall(realtorId, acct.id, 'https://account-d.docusign.com/oauth/userinfo', { method: 'GET' });
    const account = ((info.data as { accounts?: { account_id: string; is_default?: boolean; base_uri: string }[] })?.accounts ?? []).find((a) => a.is_default) ?? (info.data as { accounts?: { account_id: string; base_uri: string }[] })?.accounts?.[0];
    if (!info.ok || !account) throw new Error('Could not reach DocuSign.');
    const res = await proxyCall(realtorId, acct.id, `${account.base_uri}/restapi/v2.1/accounts/${account.account_id}/envelopes/${row.external_id}`, { method: 'GET' });
    if (!res.ok) throw new Error(`DocuSign could not check this document (${res.status}).`);
    const s = String((res.data as { status?: string }).status ?? '').toLowerCase();
    status = s === 'completed' ? 'completed' : s === 'declined' ? 'declined' : s === 'voided' ? 'cancelled' : 'sent';
  } else {
    const res = await proxyCall(realtorId, acct.id, `https://api.boldsign.com/v1/document/properties?documentId=${encodeURIComponent(row.external_id)}`, { method: 'GET' });
    if (!res.ok) throw new Error(`BoldSign could not check this document (${res.status}).`);
    const s = String((res.data as { status?: string }).status ?? '').toLowerCase();
    status = s === 'completed' ? 'completed' : s === 'declined' ? 'declined' : s === 'revoked' || s === 'expired' ? 'cancelled' : 'sent';
  }
  await query(`UPDATE closing_time_envelopes SET status=$3, updated_at=NOW() WHERE id=$1 AND realtor_id=$2`, [id, realtorId, status]);
  return status;
}
