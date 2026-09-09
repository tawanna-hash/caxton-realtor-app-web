'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import PageTitle from '@/components/ui/PageTitle';

type Status = {
  configured: boolean;
  environment: 'sandbox' | 'production';
  connected: boolean;
  realmId: string | null;
  companyName: string | null;
  connectedBy: string | null;
  connectedAt: string | null;
  updatedAt: string | null;
  invoiceSyncReady: boolean;
  paymentSyncReady: boolean;
  productionSyncEnabled: boolean;
  missingConfiguration: string[];
};

type InvoiceRow = {
  id: string;
  number: string | null;
  status: string;
  total_cents: number;
  advertiser_name: string | null;
  quickbooks_invoice_id: string | null;
  quickbooks_synced_at: string | null;
};

type LogRow = {
  operation: string;
  local_entity_id: string | null;
  qbo_entity_type: string | null;
  qbo_entity_id: string | null;
  status: string;
  detail: string | null;
  created_at: string;
};

type Payload = {
  status: Status;
  recentInvoices: InvoiceRow[];
  recentLogs: LogRow[];
};

function money(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function formatDate(value: string | null): string {
  if (!value) return 'Not yet';
  return new Date(value).toLocaleString();
}

export default function QuickBooksClient() {
  const params = useSearchParams();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(
    params.get('connected') === '1' ? 'QuickBooks connected successfully.' : null,
  );
  const [error, setError] = useState<string | null>(
    params.get('error') ? `QuickBooks connection failed: ${params.get('error')}.` : null,
  );

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/integrations/quickbooks/status', {
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Status request failed (${response.status})`);
      setData(body as Payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load QuickBooks status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function post(path: string, key: string, requestBody?: Record<string, unknown>) {
    setWorking(key);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: requestBody ? { 'Content-Type': 'application/json' } : undefined,
        body: requestBody ? JSON.stringify(requestBody) : undefined,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || body.message || `Request failed (${response.status})`);
      setMessage(
        key === 'test'
          ? `Connection verified for ${body.company?.companyName || 'QuickBooks'}.`
          : key === 'disconnect'
            ? 'QuickBooks disconnected.'
            : `Invoice synced to QuickBooks ${data?.status.environment || 'company'}.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'QuickBooks request failed.');
    } finally {
      setWorking(null);
    }
  }

  async function disconnect() {
    if (!window.confirm(
      `Disconnect QuickBooks? Stored OAuth tokens and sync mappings for this ${
        data?.status.environment || 'company'
      } connection will be removed.`,
    )) return;
    await post('/api/admin/integrations/quickbooks/disconnect', 'disconnect');
  }

  async function syncInvoice(invoice: InvoiceRow) {
    const isProduction = data?.status.environment === 'production';
    if (isProduction && !data.status.productionSyncEnabled) return;
    if (isProduction && !window.confirm(
      `Create or update invoice ${invoice.number || invoice.id} in the live QuickBooks company?`,
    )) return;
    await post(
      `/api/admin/integrations/quickbooks/invoices/${invoice.id}/sync`,
      invoice.id,
      isProduction ? { confirmProduction: true } : undefined,
    );
  }

  const connectionTone = useMemo(() => {
    if (!data?.status.configured) return 'border-amber-200 bg-amber-50 text-amber-900';
    if (!data.status.connected) return 'border-gray-200 bg-gray-50 text-gray-800';
    return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  }, [data]);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-gray-500">
            Admin · Accounting Integration
          </div>
          <PageTitle size="md">QuickBooks Online</PageTitle>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Connect Realty News Now to QuickBooks, verify the company, and control
            invoice and Stripe payment synchronization from one place.
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
          data?.status.environment === 'production'
            ? 'border-red-300 bg-red-50 text-red-800'
            : 'border-amber-300 bg-amber-50 text-amber-800'
        }`}>
          {data?.status.environment === 'production' ? 'Live company' : 'Sandbox'}
        </span>
      </header>

      {message && (
        <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="rounded-md border border-gray-200 bg-white p-8 text-sm text-gray-500">
          Loading QuickBooks status…
        </div>
      ) : data && (
        <>
          <section className={`rounded-md border p-5 ${connectionTone}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">
                  {data.status.connected
                    ? data.status.companyName || 'Connected QuickBooks company'
                    : data.status.configured
                      ? 'Ready to connect'
                      : 'Configuration required'}
                </h2>
                <p className="mt-1 text-sm">
                  {data.status.connected
                    ? `Realm ${data.status.realmId} · Connected ${formatDate(data.status.connectedAt)}`
                    : data.status.configured
                      ? `OAuth credentials are loaded. Connect an Intuit ${data.status.environment} company to continue.`
                      : 'Add the required server environment variables before starting OAuth.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!data.status.connected ? (
                  <a
                    href="/api/admin/integrations/quickbooks/connect"
                    aria-disabled={!data.status.configured}
                    className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                      data.status.configured
                        ? 'bg-blue-700 hover:bg-blue-800'
                        : 'pointer-events-none bg-gray-400'
                    }`}
                  >
                    Connect QuickBooks
                  </a>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={working !== null}
                      onClick={() => post('/api/admin/integrations/quickbooks/test', 'test')}
                      className="rounded-md border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                    >
                      {working === 'test' ? 'Testing…' : 'Test connection'}
                    </button>
                    <button
                      type="button"
                      disabled={working !== null}
                      onClick={disconnect}
                      className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {working === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-md border border-gray-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">OAuth</div>
              <div className="mt-2 text-sm font-medium text-gray-900">
                {data.status.configured ? 'Configured' : 'Needs credentials'}
              </div>
              <p className="mt-1 text-xs text-gray-500">Tokens are encrypted at rest with AES-256-GCM.</p>
            </div>
            <div className="rounded-md border border-gray-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Invoices</div>
              <div className="mt-2 text-sm font-medium text-gray-900">
                {data.status.environment === 'production' && !data.status.productionSyncEnabled
                  ? 'Live writes locked'
                  : data.status.invoiceSyncReady ? 'Ready' : 'Needs service item'}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {data.status.environment === 'production' && !data.status.productionSyncEnabled
                  ? 'Connection testing is read-only until production sync is explicitly enabled.'
                  : 'Requires one QuickBooks service item for Realty News Now sales.'}
              </p>
            </div>
            <div className="rounded-md border border-gray-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Stripe payments</div>
              <div className="mt-2 text-sm font-medium text-gray-900">
                {data.status.paymentSyncReady ? 'Ready' : 'Needs clearing account'}
              </div>
              <p className="mt-1 text-xs text-gray-500">Paid invoices post to a dedicated Stripe clearing account.</p>
            </div>
          </section>

          {data.status.missingConfiguration.length > 0 && (
            <section className="rounded-md border border-amber-200 bg-amber-50 p-5">
              <h2 className="font-semibold text-amber-950">Configuration checklist</h2>
              <p className="mt-1 text-sm text-amber-900">
                Add these server-only values in Vercel. Never place them in client-side variables.
              </p>
              <ul className="mt-3 grid gap-2 text-sm font-mono text-amber-950 sm:grid-cols-2">
                {data.status.missingConfiguration.map((name) => (
                  <li key={name} className="rounded border border-amber-200 bg-white/70 px-3 py-2">{name}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-md border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="font-semibold text-gray-900">Recent invoices</h2>
              <p className="mt-1 text-sm text-gray-600">
                {data.status.environment === 'production'
                  ? 'Live sync requires a separate confirmation for every invoice. Draft and void invoices are excluded.'
                  : 'Manual sandbox sync only. Draft and void invoices are excluded.'}
              </p>
            </div>
            {data.recentInvoices.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">No eligible invoices yet.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {data.recentInvoices.map((invoice) => (
                  <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900">
                        {invoice.number || 'Unnumbered invoice'} · {invoice.advertiser_name || 'Unknown partner'}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {money(invoice.total_cents)} · {invoice.status}
                        {invoice.quickbooks_invoice_id
                          ? ` · QuickBooks invoice ${invoice.quickbooks_invoice_id}`
                          : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={
                        working !== null
                        || !data.status.connected
                        || !data.status.invoiceSyncReady
                        || (data.status.environment === 'production' && !data.status.productionSyncEnabled)
                        || (invoice.status === 'paid' && !data.status.paymentSyncReady)
                      }
                      onClick={() => void syncInvoice(invoice)}
                      className="rounded-md bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      {working === invoice.id
                        ? 'Syncing…'
                        : invoice.quickbooks_invoice_id
                          ? 'Verify sync'
                          : data.status.environment === 'production'
                            ? 'Sync to live'
                            : 'Sync to sandbox'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-md border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="font-semibold text-gray-900">Sync activity</h2>
            </div>
            {data.recentLogs.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">No QuickBooks sync attempts yet.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {data.recentLogs.map((log, index) => (
                  <div key={`${log.created_at}-${index}`} className="grid gap-1 px-5 py-3 text-sm sm:grid-cols-[9rem_1fr_auto]">
                    <span className="text-gray-500">{formatDate(log.created_at)}</span>
                    <span className="text-gray-800">{log.detail || log.operation}</span>
                    <span className={
                      log.status === 'succeeded'
                        ? 'font-medium text-emerald-700'
                        : log.status === 'failed'
                          ? 'font-medium text-red-700'
                          : 'font-medium text-gray-600'
                    }>
                      {log.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
