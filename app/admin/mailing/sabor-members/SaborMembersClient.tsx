// app/admin/mailing/sabor-members/SaborMembersClient.tsx
//
// Client component: SABOR Members admin landing. Shows sync metadata
// (last run, totals, freshness) and a Sync Now button. Members themselves
// live in the existing /admin/mailing/holding view filtered by source
// = ramco-sabor.

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

interface Status {
  ok: true;
  meta: {
    last_run_at: string | null;
    last_status: string | null;
    last_message: string | null;
    last_total: number | null;
    last_inserted: number | null;
    last_updated: number | null;
    last_errors: number | null;
    cookie_set_at: string | null;
  };
  member_count: number;
  cookie_present: boolean;
  gh_dispatch_configured: boolean;
}

function formatRelative(iso: string | null, mountedAtMs: number): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'never';
  const diffMs = mountedAtMs - then;
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.round(hr / 24);
  return `${day} day${day === 1 ? '' : 's'} ago`;
}

export default function SaborMembersClient() {
  // Capture epoch at mount to avoid react-hooks/purity warning.
  const [mountedAtMs] = useState<number>(() => Date.now());
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/mailing/sabor-realtors/status', { credentials: 'include' })
      .then((r) => r.json())
      .then((j: Status) => {
        setStatus(j);
        setError(null);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/mailing/sabor-realtors/status', { credentials: 'include' })
      .then((r) => r.json())
      .then((j: Status) => {
        if (cancelled) return;
        setStatus(j);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const triggerSync = useCallback(async () => {
    if (!confirm('Trigger a full SABOR member sync? This runs in GitHub Actions and takes ~90 minutes.')) {
      return;
    }
    setSyncing(true);
    setToast(null);
    try {
      const res = await fetch('/api/admin/mailing/sabor-realtors/sync-now', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const j = (await res.json()) as { ok: boolean; message?: string };
      if (j.ok) {
        setToast(j.message ?? 'Sync dispatched.');
        // Reload status after a short delay
        setTimeout(load, 5000);
      } else {
        setToast(j.message ?? 'Sync failed to dispatch.');
      }
    } catch (e: unknown) {
      setToast(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }, [load]);

  const lastRun = status?.meta.last_run_at ?? null;
  const lastRunRelative = formatRelative(lastRun, mountedAtMs);
  const lastStatus = status?.meta.last_status;
  const lastTotal = status?.meta.last_total ?? null;
  const lastInserted = status?.meta.last_inserted ?? null;
  const lastUpdated = status?.meta.last_updated ?? null;
  const lastErrors = status?.meta.last_errors ?? null;

  return (
    <div className="max-w-5xl mx-auto py-10 px-6">
      <div className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
        Mailing &middot; Member Sources
      </div>
      <h1 className="font-serif text-3xl md:text-4xl text-[#1A1A1A] mb-2">
        SABOR Members
      </h1>
      <p className="text-gray-600 text-sm max-w-2xl">
        Mirrors the San Antonio Board of REALTORS member directory from
        ramco.sabor.com into the holding tank. Records ingest with source{' '}
        <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[12px]">ramco-sabor</code>
        {' '}and segment <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[12px]">realtor</code>.
      </p>

      {loading && (
        <div className="mt-10 text-gray-500 text-sm">Loading sync status&hellip;</div>
      )}

      {error && (
        <div className="mt-10 p-4 bg-red-50 border border-red-200 rounded text-sm text-red-800">
          {error}
        </div>
      )}

      {status && (
        <>
          {/* KPI cards */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Members on file" value={status.member_count.toLocaleString()} sub="ramco-sabor source" />
            <KpiCard
              label="Last sync"
              value={lastRunRelative}
              sub={lastStatus ? `status: ${lastStatus}` : 'no runs yet'}
              accent={lastStatus === 'success' ? '#10B981' : lastStatus === 'error' ? '#DC2626' : '#9CA3AF'}
            />
            <KpiCard
              label="Last batch totals"
              value={
                lastTotal !== null
                  ? `${lastTotal} fetched`
                  : '\u2014'
              }
              sub={
                lastInserted !== null
                  ? `+${lastInserted} new \u00b7 ~${lastUpdated ?? 0} updated`
                  : ''
              }
            />
            <KpiCard
              label="Cookies"
              value={status.cookie_present ? 'Set' : 'Missing'}
              sub={status.cookie_present ? 'rotate ~weekly' : 'env vars not set'}
              accent={status.cookie_present ? '#10B981' : '#DC2626'}
            />
          </div>

          {/* Configuration warnings */}
          {!status.cookie_present && (
            <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded text-sm text-amber-900">
              <div className="font-semibold mb-1">RAMCO_SABOR_SESSION_ID / RAMCO_SABOR_AUTH not set</div>
              <p className="text-amber-800">
                The scraper can&apos;t authenticate to ramco.sabor.com until these cookie values are set in
                the Vercel env (and mirrored to GitHub Actions secrets). See the README in
                <code className="bg-amber-100 px-1.5 py-0.5 rounded ml-1">scripts/sabor-sync.ts</code>.
              </p>
            </div>
          )}
          {!status.gh_dispatch_configured && (
            <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded text-sm text-amber-900">
              <div className="font-semibold mb-1">GitHub Actions dispatch not configured</div>
              <p className="text-amber-800">
                Sync-Now needs <code className="bg-amber-100 px-1.5 py-0.5 rounded">GH_DISPATCH_TOKEN</code> and
                <code className="bg-amber-100 px-1.5 py-0.5 rounded ml-1">GH_DISPATCH_REPO</code> in Vercel env.
                Until then nightly runs work but the button does nothing.
              </p>
            </div>
          )}
          {lastStatus === 'error' && status.meta.last_message && (
            <div className="mt-3 p-4 bg-red-50 border border-red-200 rounded text-sm text-red-900">
              <div className="font-semibold mb-1">Last run reported errors</div>
              <p>{status.meta.last_message}</p>
              {(lastErrors ?? 0) > 0 && (
                <p className="mt-1 text-red-800">{lastErrors} record(s) failed to fetch.</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={triggerSync}
              disabled={syncing || !status.gh_dispatch_configured}
              className="px-5 py-2.5 rounded-md bg-[#3D0740] text-white text-sm font-semibold hover:bg-[#531055] disabled:bg-gray-400 disabled:cursor-not-allowed transition"
            >
              {syncing ? 'Dispatching\u2026' : 'Sync SABOR Now'}
            </button>
            <Link
              href="/admin/mailing/holding?source=ramco-sabor"
              className="px-5 py-2.5 rounded-md border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
            >
              View members in holding tank &rarr;
            </Link>
            <button
              type="button"
              onClick={load}
              className="px-3 py-2 rounded-md border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>

          {toast && (
            <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded text-sm text-gray-800">
              {toast}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent = '#3D0740',
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500 font-medium mb-1">
        {label}
      </div>
      <div className="text-2xl font-semibold" style={{ color: accent }}>
        {value}
      </div>
      {sub && <div className="text-[12px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}
