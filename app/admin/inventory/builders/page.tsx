'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import PageTitle from '@/components/ui/PageTitle';

type BuilderVisibility = {
  builder_name: string;
  total_count: number;
  active_count: number;
  public_enabled: boolean;
};

export default function AdminBuilderPagesPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [builders, setBuilders] = useState<BuilderVisibility[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/inventory/builders', { cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const data = (await res.json()) as { builders: BuilderVisibility[] };
        if (cancelled) return;
        setBuilders(data.builders);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setBuilders([]);
        setError(e instanceof Error ? e.message : 'Failed to load builders');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const toggle = useCallback(async (builderName: string, next: boolean) => {
    setPending(builderName);
    setError(null);
    try {
      const res = await fetch('/api/admin/inventory/builders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ builderName, publicEnabled: next }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Failed to update (${res.status}) ${txt}`);
      }
      // optimistic local update
      setBuilders((prev) =>
        (prev ?? []).map((b) =>
          b.builder_name === builderName ? { ...b, public_enabled: next } : b,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update');
      setReloadKey((k) => k + 1);
    } finally {
      setPending(null);
    }
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="mb-6 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-1">
            Admin
          </p>
          <PageTitle size="md">Advertiser Pages</PageTitle>
          <p className="text-sm text-gray-600 font-light mt-2 max-w-2xl">
            Enable or disable individual builder (advertiser) public pages.
            Disabling a builder hides its listings, communities, and detail pages
            from the public site while keeping all data in the database.
          </p>
        </div>
        <Link
          href="/admin/inventory"
          className="shrink-0 border border-brand-700 text-brand-700 px-4 py-2 text-sm font-medium hover:bg-brand-50 rounded-md transition-colors whitespace-nowrap self-start"
        >
          ← Back to Inventory
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3 font-medium">Builder / Advertiser</th>
              <th className="px-4 py-3 font-medium text-right">Active rows</th>
              <th className="px-4 py-3 font-medium text-right">Total rows</th>
              <th className="px-4 py-3 font-medium text-right">Public page</th>
            </tr>
          </thead>
          <tbody>
            {builders === null ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : builders.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-gray-500">
                  No builders found.
                </td>
              </tr>
            ) : (
              builders.map((b) => {
                const busy = pending === b.builder_name;
                return (
                  <tr key={b.builder_name} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-medium text-gray-900">{b.builder_name}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{b.active_count}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{b.total_count}</td>
                    <td className="px-4 py-3 text-right">
                      {b.public_enabled ? (
                        <button
                          type="button"
                          onClick={() => toggle(b.builder_name, false)}
                          disabled={busy}
                          className="bg-green-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-green-700 rounded-md transition-colors disabled:opacity-60"
                        >
                          {busy ? '…' : 'Enabled · click to hide'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggle(b.builder_name, true)}
                          disabled={busy}
                          className="bg-red-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-red-700 rounded-md transition-colors disabled:opacity-60"
                        >
                          {busy ? '…' : 'Hidden · click to enable'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
