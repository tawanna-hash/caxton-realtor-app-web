import 'server-only';

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { query } from '@/lib/server/db/neon';

export type QuickBooksEnvironment = 'sandbox' | 'production';

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in?: number;
  scope?: string;
};

type ConnectionRow = {
  environment: QuickBooksEnvironment;
  realm_id: string;
  company_name: string | null;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  access_token_expires_at: string | Date;
  refresh_token_expires_at: string | Date | null;
  scope: string;
  connected_by: string | null;
  connected_at: string | Date;
  updated_at: string | Date;
};

type QboFault = {
  Fault?: {
    Error?: Array<{ Message?: string; Detail?: string; code?: string }>;
    type?: string;
  };
};

export type QuickBooksStatus = {
  configured: boolean;
  environment: QuickBooksEnvironment;
  connected: boolean;
  realmId: string | null;
  companyName: string | null;
  scope: string | null;
  connectedBy: string | null;
  connectedAt: string | null;
  updatedAt: string | null;
  invoiceSyncReady: boolean;
  paymentSyncReady: boolean;
  productionSyncEnabled: boolean;
  missingConfiguration: string[];
};

export type QuickBooksSyncResult = {
  customerId: string;
  invoiceId: string;
  paymentId: string | null;
  alreadySynced: boolean;
};

const AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const ACCOUNTING_SCOPE = 'com.intuit.quickbooks.accounting';
const MINOR_VERSION = '75';

function environment(): QuickBooksEnvironment {
  return process.env.QUICKBOOKS_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
}

function productionSyncEnabled(): boolean {
  return process.env.QUICKBOOKS_ALLOW_PRODUCTION_SYNC === 'true';
}

function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const vercel = process.env.VERCEL_URL?.trim();
  const base = explicit || (vercel ? `https://${vercel}` : '');
  if (!base) throw new Error('Set NEXT_PUBLIC_SITE_URL or QUICKBOOKS_REDIRECT_URI.');
  return base.replace(/\/$/, '');
}

export function getQuickBooksRedirectUri(): string {
  return process.env.QUICKBOOKS_REDIRECT_URI?.trim()
    || `${siteUrl()}/api/admin/integrations/quickbooks/callback`;
}

function credentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID?.trim();
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error('QuickBooks OAuth credentials are not configured.');
  }
  return { clientId, clientSecret };
}

function encryptionKey(): Buffer {
  const secret = process.env.QUICKBOOKS_TOKEN_ENCRYPTION_KEY?.trim();
  if (!secret) throw new Error('QUICKBOOKS_TOKEN_ENCRYPTION_KEY is not configured.');
  return createHash('sha256').update(secret, 'utf8').digest();
}

function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString('base64url')).join('.');
}

function decrypt(value: string): string {
  const [ivPart, tagPart, ciphertextPart] = value.split('.');
  if (!ivPart || !tagPart || !ciphertextPart) throw new Error('Invalid encrypted QuickBooks token.');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivPart, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function basicAuthorization(): string {
  const { clientId, clientSecret } = credentials();
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({})) as T & QboFault;
  if (!response.ok) {
    const first = json.Fault?.Error?.[0];
    const detail = first?.Detail || first?.Message || `HTTP ${response.status}`;
    throw new Error(`QuickBooks request failed: ${detail}`);
  }
  return json;
}

export function isQuickBooksConfigured(): boolean {
  return Boolean(
    process.env.QUICKBOOKS_CLIENT_ID?.trim()
    && process.env.QUICKBOOKS_CLIENT_SECRET?.trim()
    && process.env.QUICKBOOKS_TOKEN_ENCRYPTION_KEY?.trim(),
  );
}

export function buildQuickBooksAuthorizeUrl(state: string): string {
  const { clientId } = credentials();
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', ACCOUNTING_SCOPE);
  url.searchParams.set('redirect_uri', getQuickBooksRedirectUri());
  url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeQuickBooksCode(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: getQuickBooksRedirectUri(),
  });
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: basicAuthorization(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    cache: 'no-store',
  });
  return parseJsonResponse<TokenResponse>(response);
}

async function refreshQuickBooksTokens(refreshToken: string): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: basicAuthorization(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    cache: 'no-store',
  });
  return parseJsonResponse<TokenResponse>(response);
}

async function connectionRow(): Promise<ConnectionRow | null> {
  const rows = await query<ConnectionRow>(
    `SELECT * FROM quickbooks_connections WHERE environment = $1 LIMIT 1`,
    [environment()],
  );
  return rows[0] ?? null;
}

function iso(value: string | Date | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function getQuickBooksStatus(): Promise<QuickBooksStatus> {
  const env = environment();
  const missingConfiguration: string[] = [];
  if (!process.env.QUICKBOOKS_CLIENT_ID?.trim()) missingConfiguration.push('QUICKBOOKS_CLIENT_ID');
  if (!process.env.QUICKBOOKS_CLIENT_SECRET?.trim()) missingConfiguration.push('QUICKBOOKS_CLIENT_SECRET');
  if (!process.env.QUICKBOOKS_TOKEN_ENCRYPTION_KEY?.trim()) {
    missingConfiguration.push('QUICKBOOKS_TOKEN_ENCRYPTION_KEY');
  }
  const invoiceSyncReady = Boolean(process.env.QUICKBOOKS_DEFAULT_ITEM_ID?.trim());
  const paymentSyncReady = invoiceSyncReady
    && Boolean(process.env.QUICKBOOKS_STRIPE_CLEARING_ACCOUNT_ID?.trim());
  if (!invoiceSyncReady) missingConfiguration.push('QUICKBOOKS_DEFAULT_ITEM_ID');
  if (!process.env.QUICKBOOKS_STRIPE_CLEARING_ACCOUNT_ID?.trim()) {
    missingConfiguration.push('QUICKBOOKS_STRIPE_CLEARING_ACCOUNT_ID');
  }

  let row: ConnectionRow | null = null;
  try {
    row = await connectionRow();
  } catch {
    // The status route remains useful before the migration is applied.
  }
  return {
    configured: isQuickBooksConfigured(),
    environment: env,
    connected: Boolean(row),
    realmId: row?.realm_id ?? null,
    companyName: row?.company_name ?? null,
    scope: row?.scope ?? null,
    connectedBy: row?.connected_by ?? null,
    connectedAt: iso(row?.connected_at ?? null),
    updatedAt: iso(row?.updated_at ?? null),
    invoiceSyncReady,
    paymentSyncReady,
    productionSyncEnabled: env === 'sandbox' || productionSyncEnabled(),
    missingConfiguration,
  };
}

async function upsertConnection(input: {
  realmId: string;
  companyName: string | null;
  tokens: TokenResponse;
  connectedBy: string;
}): Promise<void> {
  const now = Date.now();
  await query(
    `INSERT INTO quickbooks_connections (
       environment, realm_id, company_name, access_token_encrypted,
       refresh_token_encrypted, access_token_expires_at,
       refresh_token_expires_at, scope, connected_by, connected_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
     ON CONFLICT (environment) DO UPDATE SET
       realm_id = EXCLUDED.realm_id,
       company_name = EXCLUDED.company_name,
       access_token_encrypted = EXCLUDED.access_token_encrypted,
       refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
       access_token_expires_at = EXCLUDED.access_token_expires_at,
       refresh_token_expires_at = EXCLUDED.refresh_token_expires_at,
       scope = EXCLUDED.scope,
       connected_by = EXCLUDED.connected_by,
       connected_at = NOW(),
       updated_at = NOW()`,
    [
      environment(),
      input.realmId,
      input.companyName,
      encrypt(input.tokens.access_token),
      encrypt(input.tokens.refresh_token),
      new Date(now + input.tokens.expires_in * 1000),
      input.tokens.x_refresh_token_expires_in
        ? new Date(now + input.tokens.x_refresh_token_expires_in * 1000)
        : null,
      input.tokens.scope || ACCOUNTING_SCOPE,
      input.connectedBy,
    ],
  );
}

async function accessContext(): Promise<{
  accessToken: string;
  realmId: string;
}> {
  const row = await connectionRow();
  if (!row) throw new Error('QuickBooks is not connected.');
  const expiresAt = new Date(row.access_token_expires_at).getTime();
  if (expiresAt > Date.now() + 5 * 60 * 1000) {
    return { accessToken: decrypt(row.access_token_encrypted), realmId: row.realm_id };
  }

  const tokens = await refreshQuickBooksTokens(decrypt(row.refresh_token_encrypted));
  await upsertConnection({
    realmId: row.realm_id,
    companyName: row.company_name,
    tokens,
    connectedBy: row.connected_by || 'token-refresh',
  });
  return { accessToken: tokens.access_token, realmId: row.realm_id };
}

async function qboRequest<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const ctx = await accessContext();
  const base = environment() === 'sandbox'
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com';
  const url = new URL(`${base}/v3/company/${encodeURIComponent(ctx.realmId)}/${path}`);
  if (!url.searchParams.has('minorversion')) url.searchParams.set('minorversion', MINOR_VERSION);
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${ctx.accessToken}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
    cache: 'no-store',
  });
  if (response.status === 401 && retry) {
    const row = await connectionRow();
    if (row) {
      await query(
        `UPDATE quickbooks_connections SET access_token_expires_at = NOW() WHERE environment = $1`,
        [environment()],
      );
      return qboRequest<T>(path, init, false);
    }
  }
  return parseJsonResponse<T>(response);
}

export async function connectQuickBooksCompany(input: {
  code: string;
  realmId: string;
  connectedBy: string;
}): Promise<{ companyName: string }> {
  const tokens = await exchangeQuickBooksCode(input.code);
  await upsertConnection({
    realmId: input.realmId,
    companyName: null,
    tokens,
    connectedBy: input.connectedBy,
  });
  const info = await qboRequest<{
    CompanyInfo?: { CompanyName?: string };
  }>(`companyinfo/${encodeURIComponent(input.realmId)}`);
  const companyName = info.CompanyInfo?.CompanyName?.trim() || `QuickBooks company ${input.realmId}`;
  await query(
    `UPDATE quickbooks_connections SET company_name = $1, updated_at = NOW()
      WHERE environment = $2`,
    [companyName, environment()],
  );
  return { companyName };
}

export async function disconnectQuickBooks(): Promise<void> {
  await query(`DELETE FROM quickbooks_connections WHERE environment = $1`, [environment()]);
}

export async function testQuickBooksConnection(): Promise<{ companyName: string; realmId: string }> {
  const row = await connectionRow();
  if (!row) throw new Error('QuickBooks is not connected.');
  const info = await qboRequest<{ CompanyInfo?: { CompanyName?: string } }>(
    `companyinfo/${encodeURIComponent(row.realm_id)}`,
  );
  return {
    companyName: info.CompanyInfo?.CompanyName?.trim() || row.company_name || 'QuickBooks company',
    realmId: row.realm_id,
  };
}

async function linkedId(
  localType: string,
  localId: string,
  qboType: string,
): Promise<string | null> {
  const rows = await query<{ qbo_entity_id: string }>(
    `SELECT qbo_entity_id FROM quickbooks_entity_links
      WHERE environment = $1 AND local_entity_type = $2
        AND local_entity_id = $3 AND qbo_entity_type = $4 LIMIT 1`,
    [environment(), localType, localId, qboType],
  );
  return rows[0]?.qbo_entity_id ?? null;
}

async function saveLink(input: {
  localType: string;
  localId: string;
  qboType: string;
  qboId: string;
  syncToken?: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO quickbooks_entity_links (
       environment, local_entity_type, local_entity_id,
       qbo_entity_type, qbo_entity_id, qbo_sync_token, last_synced_at
     ) VALUES ($1,$2,$3,$4,$5,$6,NOW())
     ON CONFLICT (environment, local_entity_type, local_entity_id, qbo_entity_type)
     DO UPDATE SET
       qbo_entity_id = EXCLUDED.qbo_entity_id,
       qbo_sync_token = EXCLUDED.qbo_sync_token,
       last_synced_at = NOW()`,
    [
      environment(),
      input.localType,
      input.localId,
      input.qboType,
      input.qboId,
      input.syncToken ?? null,
    ],
  );
}

function safeQboName(value: string, fallback: string): string {
  const clean = value.replace(/[\t\r\n]/g, ' ').trim();
  return (clean || fallback).slice(0, 100);
}

type InvoiceSyncRow = {
  id: string;
  advertiser_id: number;
  number: string | null;
  total_cents: number;
  tax_cents: number;
  status: string;
  issued_at: string | Date | null;
  due_date: string | Date | null;
  paid_at: string | Date | null;
  bill_to_name: string | null;
  bill_to_email: string | null;
  bill_to_address: string | null;
  memo: string | null;
  line_items: Array<{ description?: string; qty?: number; unit_cents?: number }> | null;
  advertiser_name: string | null;
  contact_email: string | null;
};

async function ensureCustomer(invoice: InvoiceSyncRow): Promise<string> {
  const localId = String(invoice.advertiser_id);
  const existing = await linkedId('advertiser', localId, 'Customer');
  if (existing) return existing;

  const displayName = safeQboName(
    invoice.advertiser_name || invoice.bill_to_name || '',
    `Realty News Now partner ${localId}`,
  );
  const result = await qboRequest<{
    Customer?: { Id?: string; SyncToken?: string };
  }>('customer', {
    method: 'POST',
    body: JSON.stringify({
      DisplayName: displayName,
      CompanyName: displayName,
      PrimaryEmailAddr: invoice.bill_to_email || invoice.contact_email
        ? { Address: invoice.bill_to_email || invoice.contact_email }
        : undefined,
      Notes: `Imported from Realty News Now advertiser ${localId}`,
    }),
  });
  const qboId = result.Customer?.Id;
  if (!qboId) throw new Error('QuickBooks did not return a customer ID.');
  await saveLink({
    localType: 'advertiser',
    localId,
    qboType: 'Customer',
    qboId,
    syncToken: result.Customer?.SyncToken,
  });
  return qboId;
}

function qboDate(value: string | Date | null): string | undefined {
  if (!value) return undefined;
  return new Date(value).toISOString().slice(0, 10);
}

async function createQboInvoice(invoice: InvoiceSyncRow, customerId: string): Promise<string> {
  const existing = await linkedId('invoice', invoice.id, 'Invoice');
  if (existing) return existing;
  const itemId = process.env.QUICKBOOKS_DEFAULT_ITEM_ID?.trim();
  if (!itemId) throw new Error('QUICKBOOKS_DEFAULT_ITEM_ID is not configured.');

  const sourceLines = Array.isArray(invoice.line_items) ? invoice.line_items : [];
  const lines = sourceLines
    .filter((line) => Number(line.qty) > 0 && Number(line.unit_cents) > 0)
    .map((line) => ({
      Amount: Math.round(Number(line.qty) * Number(line.unit_cents)) / 100,
      Description: String(line.description || invoice.memo || 'Realty News Now services').slice(0, 4000),
      DetailType: 'SalesItemLineDetail',
      SalesItemLineDetail: {
        ItemRef: { value: itemId },
        Qty: Number(line.qty),
        UnitPrice: Number(line.unit_cents) / 100,
      },
    }));
  const sourceAmountCents = sourceLines.reduce(
    (sum, line) => sum + Number(line.qty || 0) * Number(line.unit_cents || 0),
    0,
  );
  const unallocatedCents = invoice.total_cents - sourceAmountCents;
  if (lines.length === 0 || unallocatedCents !== 0) {
    lines.push({
      Amount: (lines.length === 0 ? invoice.total_cents : unallocatedCents) / 100,
      Description: invoice.tax_cents && unallocatedCents === invoice.tax_cents
        ? 'Sales tax recorded by Realty News Now'
        : String(invoice.memo || 'Realty News Now services').slice(0, 4000),
      DetailType: 'SalesItemLineDetail',
      SalesItemLineDetail: { ItemRef: { value: itemId }, Qty: 1, UnitPrice: unallocatedCents / 100 },
    });
  }

  const result = await qboRequest<{
    Invoice?: { Id?: string; SyncToken?: string };
  }>('invoice', {
    method: 'POST',
    body: JSON.stringify({
      CustomerRef: { value: customerId },
      DocNumber: invoice.number || undefined,
      TxnDate: qboDate(invoice.issued_at),
      DueDate: qboDate(invoice.due_date),
      CustomerMemo: invoice.memo ? { value: invoice.memo.slice(0, 1000) } : undefined,
      PrivateNote: `Realty News Now invoice ${invoice.id}`,
      Line: lines,
    }),
  });
  const qboId = result.Invoice?.Id;
  if (!qboId) throw new Error('QuickBooks did not return an invoice ID.');
  await saveLink({
    localType: 'invoice',
    localId: invoice.id,
    qboType: 'Invoice',
    qboId,
    syncToken: result.Invoice?.SyncToken,
  });
  return qboId;
}

async function createQboPayment(
  invoice: InvoiceSyncRow,
  customerId: string,
  qboInvoiceId: string,
): Promise<string | null> {
  if (invoice.status !== 'paid' && !invoice.paid_at) return null;
  const paymentLocalId = invoice.id;
  const existing = await linkedId('payment', paymentLocalId, 'Payment');
  if (existing) return existing;
  const clearingAccountId = process.env.QUICKBOOKS_STRIPE_CLEARING_ACCOUNT_ID?.trim();
  if (!clearingAccountId) {
    throw new Error('QUICKBOOKS_STRIPE_CLEARING_ACCOUNT_ID is not configured.');
  }
  const amount = invoice.total_cents / 100;
  const result = await qboRequest<{
    Payment?: { Id?: string; SyncToken?: string };
  }>('payment', {
    method: 'POST',
    body: JSON.stringify({
      CustomerRef: { value: customerId },
      TotalAmt: amount,
      TxnDate: qboDate(invoice.paid_at),
      DepositToAccountRef: { value: clearingAccountId },
      PrivateNote: `Stripe payment for Realty News Now invoice ${invoice.number || invoice.id}`,
      Line: [{
        Amount: amount,
        LinkedTxn: [{ TxnId: qboInvoiceId, TxnType: 'Invoice' }],
      }],
    }),
  });
  const qboId = result.Payment?.Id;
  if (!qboId) throw new Error('QuickBooks did not return a payment ID.');
  await saveLink({
    localType: 'payment',
    localId: paymentLocalId,
    qboType: 'Payment',
    qboId,
    syncToken: result.Payment?.SyncToken,
  });
  return qboId;
}

async function logSync(input: {
  operation: string;
  invoiceId?: string;
  qboType?: string;
  qboId?: string;
  status: 'started' | 'succeeded' | 'failed' | 'skipped';
  detail?: string;
  createdBy: string;
}): Promise<void> {
  await query(
    `INSERT INTO quickbooks_sync_log (
       environment, operation, local_entity_type, local_entity_id,
       qbo_entity_type, qbo_entity_id, status, detail, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      environment(),
      input.operation,
      input.invoiceId ? 'invoice' : null,
      input.invoiceId ?? null,
      input.qboType ?? null,
      input.qboId ?? null,
      input.status,
      input.detail ?? null,
      input.createdBy,
    ],
  );
}

export async function syncInvoiceToQuickBooks(
  invoiceId: string,
  createdBy: string,
  confirmProduction = false,
): Promise<QuickBooksSyncResult> {
  if (environment() === 'production' && !productionSyncEnabled()) {
    throw new Error(
      'Live QuickBooks writes are locked. Set QUICKBOOKS_ALLOW_PRODUCTION_SYNC=true only after validation.',
    );
  }
  if (environment() === 'production' && !confirmProduction) {
    throw new Error('Live QuickBooks sync requires explicit confirmation for each invoice.');
  }
  await logSync({ operation: 'sync_invoice', invoiceId, status: 'started', createdBy });
  try {
    const rows = await query<InvoiceSyncRow>(
      `SELECT i.*, a.name AS advertiser_name, a.contact_email
         FROM invoices i
         LEFT JOIN advertisers a ON a.id = i.advertiser_id
        WHERE i.id = $1 LIMIT 1`,
      [invoiceId],
    );
    const invoice = rows[0];
    if (!invoice) throw new Error('Invoice not found.');
    if (invoice.status === 'draft' || invoice.status === 'void') {
      throw new Error('Only sent, paid, or overdue invoices can be synced.');
    }
    const before = await linkedId('invoice', invoice.id, 'Invoice');
    const customerId = await ensureCustomer(invoice);
    const qboInvoiceId = await createQboInvoice(invoice, customerId);
    const paymentId = await createQboPayment(invoice, customerId, qboInvoiceId);
    await logSync({
      operation: 'sync_invoice',
      invoiceId,
      qboType: paymentId ? 'Payment' : 'Invoice',
      qboId: paymentId || qboInvoiceId,
      status: 'succeeded',
      detail: paymentId ? 'Customer, invoice, and Stripe payment synced.' : 'Customer and invoice synced.',
      createdBy,
    });
    return {
      customerId,
      invoiceId: qboInvoiceId,
      paymentId,
      alreadySynced: Boolean(before),
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown sync failure';
    await logSync({
      operation: 'sync_invoice',
      invoiceId,
      status: 'failed',
      detail,
      createdBy,
    }).catch(() => undefined);
    throw error;
  }
}

export async function listQuickBooksSyncOverview(): Promise<{
  recentLogs: Array<Record<string, unknown>>;
  recentInvoices: Array<Record<string, unknown>>;
}> {
  const env = environment();
  const [recentLogs, recentInvoices] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT operation, local_entity_id, qbo_entity_type, qbo_entity_id,
              status, detail, created_by, created_at
         FROM quickbooks_sync_log
        WHERE environment = $1
        ORDER BY created_at DESC LIMIT 20`,
      [env],
    ).catch(() => []),
    query<Record<string, unknown>>(
      `SELECT i.id, i.number, i.status, i.total_cents, i.paid_at,
              a.name AS advertiser_name,
              q.qbo_entity_id AS quickbooks_invoice_id,
              q.last_synced_at AS quickbooks_synced_at
         FROM invoices i
         LEFT JOIN advertisers a ON a.id = i.advertiser_id
         LEFT JOIN quickbooks_entity_links q
           ON q.environment = $1
          AND q.local_entity_type = 'invoice'
          AND q.local_entity_id = i.id::text
          AND q.qbo_entity_type = 'Invoice'
        WHERE i.status IN ('sent', 'paid', 'overdue')
        ORDER BY i.created_at DESC LIMIT 20`,
      [env],
    ).catch(() => []),
  ]);
  return { recentLogs, recentInvoices };
}
